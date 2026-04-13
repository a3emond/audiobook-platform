import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, effect, HostListener, OnDestroy, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { interval, Subscription } from 'rxjs';

import type { Book, Chapter } from '../../../core/models/api.models';
import { AuthService } from '../../../core/services/auth.service';
import { LibraryService } from '../../../core/services/library.service';
import type { PlaybackDeviceSession } from '../../../core/services/player.service';
import { PlayerService } from '../../../core/services/player.service';
import { ProgressService } from '../../../core/services/progress.service';
import { SettingsService } from '../../../core/services/settings.service';
import { ReadMoreComponent } from '../../../shared/ui/read-more/read-more.component';
import { PlayerControlsComponent } from '../player-controls/controls';
import { SleepTimerMode } from './player-page.types';
import {
	activeChapterIndexFromTime,
	chapterEndSeconds,
	chapterStartSeconds,
	clampProgressValue,
	computeCoverUrl,
	coverInitials,
	formatLongDuration,
	formatTime,
	progressMax,
	progressMin,
	progressRangeMax,
	progressSliderValue,
	resolveProgressInputTarget,
	resolvedDescription,
	shouldHandlePlayerHotkey,
	sleepTimerLabel,
} from './player-page.utils';
import { PlayerSleepTimer } from './player-sleep-timer';

@Component({
	selector: 'app-player-page',
	standalone: true,
	imports: [CommonModule, RouterLink, PlayerControlsComponent, ReadMoreComponent],
	templateUrl: './player.page.html',
	styleUrl: './player.page.css',
})
// PlayerPage coordinates player UI concerns (resume, completion, sleep timer,
// chapter navigation, and keyboard shortcuts) on top of PlayerService.
export class PlayerPage implements OnInit, OnDestroy {
	// View state signals for template rendering.
	readonly book = signal<Book | null>(null);
	// chapters mirrors player.chapters() — computed keeps it in sync without a dead effect.
	readonly chapters = computed(() => this.player.chapters());
	readonly coverUrl = signal('');
	readonly activeChapterIndex = signal(0);
	readonly progressMode = signal<'chapter' | 'book'>('chapter');
	readonly progressMenuOpen = signal(false);
	readonly sleepTimerMode = signal<SleepTimerMode>('off');
	readonly sleepUiNow = signal(Date.now());
	readonly isCompleted = signal(false);
	readonly error = signal<string | null>(null);

	private bookId = '';
	private sleepUiTicker?: Subscription;
	private routeParamSub?: Subscription;
	private readonly sleepTimer = new PlayerSleepTimer();
	private readonly destroyRef: DestroyRef;
	private resumeAt = 0;
	private resumeLoaded = false;
	private progressLoaded = false;
	private initialPositionApplied = false;
	private lastPausedState = true;
	private routeLoadRequestId = 0;

	constructor(
		destroyRef: DestroyRef,
		private readonly route: ActivatedRoute,
		private readonly library: LibraryService,
		protected readonly player: PlayerService,
		private readonly progress: ProgressService,
		private readonly settings: SettingsService,
		protected readonly auth: AuthService,
	) {
		this.destroyRef = destroyRef;
		effect(() => {
			const current = this.player.currentSeconds();
			this.updateActiveChapterFromCurrentTime(current);
			this.handleSleepTimerTick(current);
		});

		effect(() => {
			const paused = this.player.paused();
			if (paused === this.lastPausedState) {
				return;
			}

			this.lastPausedState = paused;
			if (paused) {
				this.pauseSleepTimerCountdown();
				return;
			}

			this.armSleepTimerForPlayback();
		});
	}

	// Initial load sequence:
	// 1) fetch book metadata
	// 2) bootstrap player source
	// 3) resolve resume/progress and apply initial seek once both are known.
	ngOnInit(): void {
		this.progressMode.set('chapter');

		this.routeParamSub = this.route.paramMap.subscribe((params) => {
			const nextBookId = params.get('bookId') ?? '';
			this.loadBookFromRoute(nextBookId);
		});

		this.sleepUiTicker = interval(1000).subscribe(() => {
			this.sleepUiNow.set(Date.now());
		});
		this.loadPlayerSettings();
	}

	// Player settings are loaded independently from book data so controls are
	// usable even if resume/progress calls fail.
	private loadPlayerSettings(): void {
		this.settings
			.getMine()
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
			next: (settings) => {
				this.player.setJumpSeconds(
					settings.player.backwardJumpSeconds ?? 15,
					settings.player.forwardJumpSeconds ?? 30,
				);
				this.player.setPlaybackRate(settings.player.playbackRate ?? 1);
				this.sleepTimerMode.set(settings.player.sleepTimerMode ?? 'off');
				this.resetSleepTimerForMode();
			},
			error: () => {
				this.player.setJumpSeconds(15, 30);
				this.player.setPlaybackRate(1);
				this.sleepTimerMode.set('off');
				this.resetSleepTimerForMode();
			},
			});
	}

	private loadBookFromRoute(nextBookId: string): void {
		const requestId = ++this.routeLoadRequestId;

		if (!nextBookId) {
			this.bookId = '';
			this.book.set(null);
			this.error.set('Missing book id');
			return;
		}

		if (this.bookId && this.bookId !== nextBookId) {
			this.player.persistNow();
		}

		this.bookId = nextBookId;
		this.error.set(null);
		this.book.set(null);
		this.coverUrl.set('');
		this.resumeAt = 0;
		this.resumeLoaded = false;
		this.progressLoaded = false;
		this.initialPositionApplied = false;
		this.isCompleted.set(false);

		this.library
			.getBook(nextBookId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
			next: (book) => {
				if (requestId !== this.routeLoadRequestId || this.bookId !== nextBookId) {
					return;
				}

				const hasActiveSession = this.player.currentBook()?.id === book.id && this.player.currentSeconds() > 0;
				this.book.set(book);
				const coverUrl = this.computeCoverUrl(book);
				this.coverUrl.set(coverUrl);
				this.player.loadBook(book, { coverUrl });
				if (hasActiveSession) {
					this.initialPositionApplied = true;
				}
				this.loadResumeInfo(book, nextBookId, requestId);
			},
			error: (error: unknown) => {
				if (requestId !== this.routeLoadRequestId || this.bookId !== nextBookId) {
					return;
				}

				if (error instanceof HttpErrorResponse && error.status === 404) {
					this.error.set('Book not found. It may have been deleted or the database was reset.');
					return;
				}
				this.error.set('Unable to load book details');
			},
			});
	}

	// Resume and completion state are fetched in parallel; seek is deferred until
	// both have settled to avoid race-dependent initial positioning.
	private loadResumeInfo(book: Book, bookId: string, requestId: number): void {
		this.player
			.getResumeInfo(bookId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
			next: (resume) => {
				if (requestId !== this.routeLoadRequestId || this.bookId !== bookId) {
					return;
				}

				this.resumeAt = resume.startSeconds;
				this.resumeLoaded = true;
				this.applyInitialPositionIfReady(book, bookId, requestId);
			},
			error: (error: unknown) => {
				if (requestId !== this.routeLoadRequestId || this.bookId !== bookId) {
					return;
				}

				this.resumeLoaded = true;
				if (error instanceof HttpErrorResponse && error.status === 404) {
					this.applyInitialPositionIfReady(book, bookId, requestId);
					return;
				}
				this.error.set('Unable to load resume information');
				this.applyInitialPositionIfReady(book, bookId, requestId);
			},
			});

		this.progress
			.getForBook(bookId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
			next: (prog) => {
				if (requestId !== this.routeLoadRequestId || this.bookId !== bookId) {
					return;
				}

				this.isCompleted.set(prog.completed);
				this.progressLoaded = true;
				this.applyInitialPositionIfReady(book, bookId, requestId);
			},
			error: () => {
				if (requestId !== this.routeLoadRequestId || this.bookId !== bookId) {
					return;
				}

				// no progress record yet — not completed
				this.isCompleted.set(false);
				this.progressLoaded = true;
				this.applyInitialPositionIfReady(book, bookId, requestId);
			},
			});
	}

	// Applies initial seek exactly once per page load.
	private applyInitialPositionIfReady(book: Book, bookId: string, requestId: number): void {
		if (requestId !== this.routeLoadRequestId || this.bookId !== bookId) {
			return;
		}

		if (this.initialPositionApplied || !this.resumeLoaded || !this.progressLoaded) {
			return;
		}

		const currentBook = this.player.currentBook();
		if (!currentBook || currentBook.id !== book.id) {
			return;
		}

		if (this.isCompleted()) {
			this.player.setInitialPosition(Math.max(0, Math.floor(book.duration || 0)));
		} else if (this.resumeAt > 0) {
			this.player.setInitialPosition(this.resumeAt);
		}

		this.initialPositionApplied = true;
		this.updateActiveChapterFromCurrentTime(this.player.currentSeconds());
	}

	ngOnDestroy(): void {
		this.player.persistNow();
		this.pauseSleepTimerCountdown();
		this.routeParamSub?.unsubscribe();
		this.sleepUiTicker?.unsubscribe();
		this.sleepTimer.dispose();
	}

	togglePlay(): void {
		this.player.togglePlay();
	}

	seek(deltaSeconds: number): void {
		this.player.seek(deltaSeconds);
		this.refreshChapterSleepTargetIfNeeded();
	}

	onChapterSelected(event: Event): void {
		const value = Number((event.target as HTMLSelectElement | null)?.value);
		if (!Number.isFinite(value)) {
			return;
		}

		if (!this.chapters()[value]) {
			return;
		}

		this.player.jumpToChapter(value);
		this.activeChapterIndex.set(value);
		this.refreshChapterSleepTargetIfNeeded();
	}

	toggleProgressMenu(): void {
		this.progressMenuOpen.update((open) => !open);
	}

	listeningDevices(): PlaybackDeviceSession[] {
		return this.player.listeningDevices();
	}

	isCurrentDevice(device: PlaybackDeviceSession): boolean {
		return device.deviceId === this.player.playbackDeviceId();
	}

	isActiveDevice(device: PlaybackDeviceSession): boolean {
		return device.deviceId === this.player.activeListeningDeviceId();
	}

	listenHere(): void {
		this.player.claimListeningHere();
	}

	// Manual completion intentionally writes progress first (when duration is known)
	// so completion and position remain consistent across devices.
	markCompleted(): void {
		this.progressMenuOpen.set(false);
		const duration = this.player.durationSeconds() > 0 ? Math.floor(this.player.durationSeconds()) : 0;

		if (duration > 0) {
			this.player.pause();
			this.player.setCurrentTime(duration);
		}

		const finalizeMark = () => {
			this.progress
				.markCompleted(this.bookId)
				.pipe(takeUntilDestroyed(this.destroyRef))
				.subscribe({
				next: (prog) => {
					this.isCompleted.set(prog.completed);
					if (prog.completed && duration > 0) {
						this.player.setCurrentTime(duration);
					}
				},
				error: () => {
					this.error.set('Unable to mark book as completed');
				},
				});
		};

		if (duration <= 0) {
			finalizeMark();
			return;
		}

		const idempotencyKey = `${this.bookId}:manual-complete:${Date.now()}`;
		this.progress
			.saveForBook(
				this.bookId,
				{
					positionSeconds: duration,
					durationAtSave: duration,
				},
				idempotencyKey,
			)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => finalizeMark(),
				error: () => finalizeMark(),
			});
	}

	// Restart clears completion and rewinds both local playback and persisted progress.
	restartBook(): void {
		this.progressMenuOpen.set(false);
		this.progress
			.unmarkCompleted(this.bookId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
			next: (prog) => {
				this.isCompleted.set(prog.completed);
				this.player.setCurrentTime(0);

				if (this.player.durationSeconds() > 0) {
					const idempotencyKey = `${this.bookId}:manual-restart:${Date.now()}`;
					this.progress
						.saveForBook(
							this.bookId,
							{
								positionSeconds: 0,
								durationAtSave: Math.floor(this.player.durationSeconds()),
							},
							idempotencyKey,
						)
						.pipe(takeUntilDestroyed(this.destroyRef))
						.subscribe({ error: () => undefined });
				}
			},
			error: () => {
				this.error.set('Unable to restart book');
			},
			});
	}

	setProgressMode(mode: 'chapter' | 'book'): void {
		this.progressMode.set(mode);
		this.progressMenuOpen.set(false);
	}

	setSleepTimerMode(mode: SleepTimerMode): void {
		if (this.sleepTimerMode() === mode) {
			this.progressMenuOpen.set(false);
			return;
		}

		this.sleepTimerMode.set(mode);
		this.resetSleepTimerForMode();
		this.progressMenuOpen.set(false);

		this.settings
			.updateMine({ player: { sleepTimerMode: mode } })
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
			error: () => {
				this.error.set('Unable to save sleep timer preference');
			},
			});
	}

	sleepTimerLabel(): string {
		return sleepTimerLabel(this.sleepTimerMode());
	}

	sleepTimerCountdownText(): string | null {
		this.sleepUiNow();
		return this.sleepTimer.countdownText(this.sleepTimerMode(), Date.now());
	}

	onProgressInput(event: Event): void {
		const value = Number((event.target as HTMLInputElement | null)?.value);
		if (!Number.isFinite(value)) {
			return;
		}

		const target = resolveProgressInputTarget(this.progressMode(), value, this.activeChapter());

		this.player.setCurrentTime(target);
		this.refreshChapterSleepTargetIfNeeded();
	}

	progressRangeMin(): number {
		return 0;
	}

	progressRangeMax(): number {
		return progressRangeMax(this.progressMode(), this.player.durationSeconds(), this.activeChapter());
	}

	progressSliderValue(): number {
		return progressSliderValue(
			this.progressMode(),
			this.player.currentSeconds(),
			this.progressRangeMax(),
			this.activeChapter(),
		);
	}

	progressLeadingLabel(): string {
		return this.formatTime(this.progressSliderValue());
	}

	progressTrailingLabel(): string {
		if (this.progressMode() === 'book') {
			return this.formatTime(this.player.durationSeconds());
		}

		return this.formatTime(this.progressRangeMax());
	}

	progressMin(): number {
		return progressMin(this.progressMode(), this.activeChapter());
	}

	progressMax(): number {
		return progressMax(
			this.progressMode(),
			this.player.durationSeconds(),
			this.activeChapter(),
			this.progressMin(),
		);
	}

	progressValue(): number {
		return clampProgressValue(this.player.currentSeconds(), this.progressMin(), this.progressMax());
	}

	formatTime(totalSeconds: number): string {
		return formatTime(totalSeconds);
	}

	formatLongDuration(totalSeconds: number): string {
		return formatLongDuration(totalSeconds);
	}

	resolvedDescription(): string | null {
		return resolvedDescription(this.book());
	}

	coverInitials(title: string): string {
		return coverInitials(title);
	}

	private computeCoverUrl(book: Book): string {
		return computeCoverUrl(book, this.auth.accessToken());
	}

	private updateActiveChapterFromCurrentTime(current: number): void {
		this.activeChapterIndex.set(activeChapterIndexFromTime(this.chapters(), current));
	}

	// Sleep-timer behavior is delegated to PlayerSleepTimer; page logic only
	// provides current playback state and callback hooks.
	private handleSleepTimerTick(currentTime: number): void {
		this.sleepTimer.handleTick(this.sleepTimerMode(), currentTime, this.player.paused(), () => this.player.pause());
	}

	private refreshChapterSleepTargetIfNeeded(): void {
		this.sleepTimer.refreshChapterTarget(
			this.sleepTimerMode(),
			this.player.paused(),
			this.activeChapterEndSeconds(),
		);
	}

	private armSleepTimerForPlayback(): void {
		this.sleepTimer.armForPlayback(
			this.sleepTimerMode(),
			this.player.paused(),
			this.activeChapterEndSeconds(),
			() => this.player.pause(),
		);
	}

	private pauseSleepTimerCountdown(): void {
		this.sleepTimer.pauseCountdown(this.sleepTimerMode());
	}

	private resetSleepTimerForMode(): void {
		this.sleepTimer.resetForMode(
			this.sleepTimerMode(),
			this.player.paused(),
			this.activeChapterEndSeconds(),
			() => this.player.pause(),
		);
	}

	goToPreviousChapter(): void {
		this.player.jumpToPreviousChapter();
		this.updateActiveChapterFromCurrentTime(this.player.currentSeconds());
		this.refreshChapterSleepTargetIfNeeded();
	}

	goToNextChapter(): void {
		this.player.jumpToNextChapter();
		this.updateActiveChapterFromCurrentTime(this.player.currentSeconds());
		this.refreshChapterSleepTargetIfNeeded();
	}

	canGoToPreviousChapter(): boolean {
		return this.activeChapterIndex() > 0 || this.player.currentSeconds() > 0;
	}

	canGoToNextChapter(): boolean {
		return this.activeChapterIndex() < this.chapters().length - 1;
	}

	// Hotkeys are intentionally limited to non-form contexts to avoid hijacking text input.
	@HostListener('window:keydown', ['$event'])
	onKeyDown(event: KeyboardEvent): void {
		const target = event.target as HTMLElement | null;
		if (!shouldHandlePlayerHotkey(target)) {
			return;
		}

		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			this.seek(-this.player.backwardJumpSeconds());
			return;
		}

		if (event.key === 'ArrowRight') {
			event.preventDefault();
			this.seek(this.player.forwardJumpSeconds());
		}
	}

	private activeChapter(): Chapter | null {
		return this.chapters()[this.activeChapterIndex()] ?? null;
	}

	private activeChapterEndSeconds(): number | null {
		const chapter = this.activeChapter();
		if (!chapter) {
			return null;
		}

		return chapterEndSeconds(chapter);
	}

}
