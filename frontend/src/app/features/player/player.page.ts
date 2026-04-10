import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, HostListener, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { interval, Subscription } from 'rxjs';

import type { Book, Chapter } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { LibraryService } from '../../core/services/library.service';
import { PlayerService } from '../../core/services/player.service';
import { ProgressService } from '../../core/services/progress.service';
import { SettingsService } from '../../core/services/settings.service';
import { ReadMoreComponent } from '../../shared/ui/read-more/read-more.component';
import { PlayerControlsComponent } from './controls';

type SleepTimerMode = 'off' | '15m' | '30m' | '45m' | '60m' | 'chapter';

const SLEEP_TIMER_MINUTES: Record<Exclude<SleepTimerMode, 'off' | 'chapter'>, number> = {
	'15m': 15,
	'30m': 30,
	'45m': 45,
	'60m': 60,
};

const SLEEP_TIMER_PAUSE_RESET_MS = 30_000;

@Component({
	selector: 'app-player-page',
	standalone: true,
	imports: [CommonModule, RouterLink, PlayerControlsComponent, ReadMoreComponent],
	template: `
		<section class="page page-shell player-page">
			<header class="hero" *ngIf="book() as currentBook">
				<div class="cover-wrap">
					<div class="cover-overlay-actions">
						<button type="button" class="btn-complete" *ngIf="!isCompleted()" (click)="markCompleted()">
							Complete
						</button>
					</div>
					<img *ngIf="coverUrl()" [src]="coverUrl()" [alt]="currentBook.title + ' cover'" class="cover" />
					<div *ngIf="!coverUrl()" class="cover fallback">{{ coverInitials(currentBook.title) }}</div>
					<div class="cover-completed-overlay" *ngIf="isCompleted()">
						<span class="check">✓</span>
						<span>Completed</span>
					</div>
				</div>

				<div class="meta">
					<h1>{{ currentBook.title }}</h1>
					<p>by {{ currentBook.author }}</p>
					<a
						*ngIf="auth.isAdmin()"
						class="btn-admin-edit"
						[routerLink]="['/admin/books', currentBook.id]"
						target="_blank"
						rel="noopener noreferrer"
					>
						Edit metadata
					</a>

					@if (!isCompleted()) {
						<div class="progress-head">
							<label>
								<span>Chapter</span>
								<select [value]="activeChapterIndex()" (change)="onChapterSelected($event)">
									<option *ngFor="let chapter of chapters(); let i = index" [value]="i">
										{{ i + 1 }}. {{ chapter.title }}
									</option>
								</select>
							</label>

							<div class="menu-wrap controls-menu-wrap">
								<button
									type="button"
									class="btn-menu btn-menu-compact"
									[class.sleep-active]="sleepTimerMode() !== 'off'"
									(click)="toggleProgressMenu()"
									aria-label="Playback and sleep options"
									title="Playback and sleep options"
								>
									☾⏱
									<span class="sleep-dot" *ngIf="sleepTimerMode() !== 'off'" aria-hidden="true"></span>
								</button>
								<span class="sleep-countdown-pill" *ngIf="sleepTimerCountdownText() as countdown">{{ countdown }}</span>
								<div class="menu" *ngIf="progressMenuOpen()">
									<p class="menu-label">Progress tracking</p>
									<button type="button" (click)="setProgressMode('chapter')">
										Track chapter progress {{ progressMode() === 'chapter' ? '✓' : '' }}
									</button>
									<button type="button" (click)="setProgressMode('book')">
										Track book progress {{ progressMode() === 'book' ? '✓' : '' }}
									</button>
									<div class="menu-divider" aria-hidden="true"></div>
									<p class="menu-label">Night auto pause: {{ sleepTimerLabel() }}</p>
									<button type="button" (click)="setSleepTimerMode('off')">
										Disabled {{ sleepTimerMode() === 'off' ? '✓' : '' }}
									</button>
									<button type="button" (click)="setSleepTimerMode('15m')">
										15 min {{ sleepTimerMode() === '15m' ? '✓' : '' }}
									</button>
									<button type="button" (click)="setSleepTimerMode('30m')">
										30 min {{ sleepTimerMode() === '30m' ? '✓' : '' }}
									</button>
									<button type="button" (click)="setSleepTimerMode('45m')">
										45 min {{ sleepTimerMode() === '45m' ? '✓' : '' }}
									</button>
									<button type="button" (click)="setSleepTimerMode('60m')">
										1 h {{ sleepTimerMode() === '60m' ? '✓' : '' }}
									</button>
									<button type="button" (click)="setSleepTimerMode('chapter')">
										End of current chapter {{ sleepTimerMode() === 'chapter' ? '✓' : '' }}
									</button>
								</div>
							</div>
						</div>

						<div class="progress-panel">
							<input
								type="range"
								[min]="progressRangeMin()"
								[max]="progressRangeMax()"
								[step]="1"
								[value]="progressSliderValue()"
								(input)="onProgressInput($event)"
							/>
							<div class="times">
								<span>{{ progressLeadingLabel() }}</span>
								<span>{{ progressTrailingLabel() }}</span>
							</div>

							<div class="controls-row">
								<button type="button" class="btn-chapter-nav" [disabled]="!canGoToPreviousChapter()" (click)="goToPreviousChapter()">
									Prev chapter
								</button>
								<app-player-controls
									[paused]="player.paused()"
									[backwardSeconds]="player.backwardJumpSeconds()"
									[forwardSeconds]="player.forwardJumpSeconds()"
									(toggle)="togglePlay()"
									(seek)="seek($event)"
								/>
								<button type="button" class="btn-chapter-nav" [disabled]="!canGoToNextChapter()" (click)="goToNextChapter()">
									Next chapter
								</button>
							</div>
						</div>
					} @else {
						<section class="completed-state">
							<h3>You completed this book</h3>
							<p>Restart to listen again from the beginning.</p>
							<button type="button" class="btn-restart" (click)="restartBook()">Restart Book</button>
						</section>
					}
				</div>
			</header>

			<section class="details card" *ngIf="book() as currentBook">
				<div class="details-head">
					<div>
						<p class="eyebrow">Book Details</p>
						<h2>About this title</h2>
					</div>
					<a
						*ngIf="currentBook.series"
						class="btn btn-secondary"
						[routerLink]="['/series', currentBook.series]"
					>
						Open Series
					</a>
				</div>

				<div class="detail-grid">
					<article class="detail-card" *ngIf="currentBook.series">
						<h3>Series</h3>
						<p>
							{{ currentBook.series }}
							<span *ngIf="currentBook.seriesIndex"> · Book {{ currentBook.seriesIndex }}</span>
						</p>
					</article>

					<article class="detail-card" *ngIf="currentBook.genre">
						<h3>Genre</h3>
						<p>{{ currentBook.genre }}</p>
					</article>

					<article class="detail-card" *ngIf="currentBook.tags?.length">
						<h3>Tags</h3>
						<app-read-more [text]="currentBook.tags?.join(' • ') ?? ''" [limit]="120" />
					</article>

					<article class="detail-card">
						<h3>Duration</h3>
						<p>{{ formatLongDuration(currentBook.duration) }}</p>
					</article>
				</div>

				<div class="description" *ngIf="resolvedDescription() as description; else noDescription">
					<h3>Description</h3>
					<app-read-more [text]="description" [limit]="280" />
				</div>

				<ng-template #noDescription>
					<div class="description empty-description">
						<h3>Description</h3>
						<p>No description is available for this book yet.</p>
					</div>
				</ng-template>
			</section>

			<p *ngIf="error()" class="error">{{ error() }}</p>
		</section>
	`,
	styles: [
		`
			.page {
				position: relative;
				display: grid;
				gap: 1rem;
				isolation: isolate;
			}
			.page::before {
				content: '';
				position: absolute;
				inset: -2.5rem 0 auto;
				height: min(54vw, 24rem);
				background: url('/logo.png') center top / min(72vw, 36rem) no-repeat;
				opacity: 0.05;
				pointer-events: none;
				z-index: -1;
			}
			.player-page {
				max-width: 960px;
				margin: 0 auto;
				justify-items: stretch;
			}
			.hero {
				display: grid;
				grid-template-columns: 190px 1fr;
				gap: 1rem;
				align-items: start;
				width: 100%;
				padding: 1rem;
				background: linear-gradient(145deg, #151515, #101010 72%);
				border: 1px solid var(--color-border);
				border-radius: 1rem;
				box-shadow: var(--shadow);
			}
			.cover-wrap {
				position: relative;
				width: 190px;
				height: 190px;
			}
			.cover-overlay-actions {
				position: absolute;
				top: 0.45rem;
				right: 0.45rem;
				display: flex;
				align-items: center;
				justify-content: flex-end;
				gap: 0.4rem;
				z-index: 3;
			}
			.cover {
				width: 100%;
				height: 100%;
				object-fit: cover;
				border-radius: 0.8rem;
				box-shadow: 0 12px 24px rgb(2 6 23 / 0.35);
			}
			.cover.fallback {
				display: grid;
				place-items: center;
				background: linear-gradient(135deg, #ff8a00, #402000 78%);
				color: #fff;
				font-size: 1.8rem;
				font-weight: 700;
			}
			.meta h1 {
				margin: 0;
				font-size: clamp(1.5rem, 3.1vw, 2.1rem);
				line-height: 1.1;
			}
			.meta p {
				margin: 0.35rem 0 0;
				color: var(--color-text-muted);
			}
			.btn-admin-edit {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				margin-top: 0.6rem;
				padding: 0.32rem 0.72rem;
				border-radius: 999px;
				border: 1px solid rgb(255 138 0 / 0.45);
				background: rgb(255 138 0 / 0.14);
				color: #ffd08a;
				font-size: 0.78rem;
				font-weight: 700;
				text-decoration: none;
			}
			.btn-admin-edit:hover {
				background: rgb(255 138 0 / 0.24);
				color: #fff0d6;
			}
			.progress-head {
				margin-top: 0.85rem;
				display: flex;
				align-items: end;
				justify-content: space-between;
				gap: 0.8rem;
			}
			.progress-head label {
				display: grid;
				gap: 0.35rem;
				max-width: 420px;
				width: 100%;
			}
			.progress-panel {
				margin-top: 0.65rem;
				display: grid;
				gap: 0.55rem;
			}
			.progress-panel input[type='range'] {
				width: 100%;
			}
			.times {
				display: flex;
				justify-content: space-between;
				font-size: 0.84rem;
				color: var(--color-text-muted);
			}
			.controls-row {
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 0.5rem;
			}
			.btn-chapter-nav {
				border: 1px solid #3a3a3a;
				background: #171717;
				color: var(--color-text);
				border-radius: 999px;
				padding: 0.34rem 0.65rem;
				font-size: 0.72rem;
				font-weight: 700;
			}
			.btn-chapter-nav:disabled {
				opacity: 0.45;
				cursor: not-allowed;
			}
			.menu-wrap {
				position: relative;
			}
			.btn-menu {
				border: 1px solid #3a3a3a;
				background: #1a1a1a;
				color: var(--color-text);
				border-radius: 999px;
				padding: 0.45rem 0.95rem;
				font-weight: 700;
				cursor: pointer;
			}
			.btn-menu.sleep-active {
				border-color: rgb(255 138 0 / 0.55);
				box-shadow: 0 0 0 2px rgb(255 138 0 / 0.16);
			}
			.btn-menu-compact {
				position: relative;
				width: 2.2rem;
				height: 2.2rem;
				padding: 0;
				line-height: 1;
				font-size: 1.1rem;
				display: inline-grid;
				place-items: center;
			}
			.sleep-dot {
				position: absolute;
				top: 0.2rem;
				right: 0.16rem;
				width: 0.38rem;
				height: 0.38rem;
				border-radius: 999px;
				background: #ff8a00;
				box-shadow: 0 0 0 2px rgb(10 10 10 / 0.95);
			}
			.sleep-countdown-pill {
				display: inline-flex;
				align-items: center;
				height: 2.2rem;
				margin-left: 0.35rem;
				padding: 0 0.62rem;
				border-radius: 999px;
				border: 1px solid rgb(255 138 0 / 0.42);
				background: rgb(255 138 0 / 0.12);
				color: #ffe6be;
				font-size: 0.76rem;
				font-weight: 700;
			}
			.controls-menu-wrap .menu {
				right: 0;
				top: calc(100% + 0.35rem);
				z-index: 60;
			}
			.menu {
				position: absolute;
				right: 0;
				top: calc(100% + 0.3rem);
				z-index: 60;
				background: #181818;
				border: 1px solid var(--color-border);
				border-radius: 0.5rem;
				box-shadow: var(--shadow-sm);
				display: grid;
				min-width: 220px;
				overflow: hidden;
			}
			.controls-menu-wrap {
				z-index: 50;
			}
			.menu button {
				border: none;
				text-align: left;
				padding: 0.55rem 0.7rem;
				background: #181818;
				color: var(--color-text);
			}
			.menu button:hover {
				background: #252525;
			}
			.menu-label {
				margin: 0;
				padding: 0.45rem 0.7rem 0.3rem;
				font-size: 0.72rem;
				font-weight: 700;
				letter-spacing: 0.02em;
				color: var(--color-text-muted);
			}
			.menu-divider {
				height: 1px;
				margin: 0.2rem 0.55rem;
				background: rgb(255 255 255 / 0.1);
			}
			.btn-complete {
				border: 1px solid rgb(255 138 0 / 0.3);
				border-radius: 999px;
				padding: 0.14rem 0.48rem;
				font-size: 0.64rem;
				font-weight: 700;
				cursor: pointer;
				background: rgb(10 10 10 / 0.72);
				color: #ffd08a;
				backdrop-filter: blur(2px);
			}
			.btn-complete.secondary {
				background: rgb(224 231 255 / 0.9);
				color: #1e3a8a;
				border: 1px solid #a5b4fc;
			}
			.completed-state {
				margin-top: 0.95rem;
				border: 1px solid #383838;
				border-radius: 0.85rem;
				background: linear-gradient(180deg, #161616, #111111);
				padding: 0.9rem;
				display: grid;
				gap: 0.45rem;
			}
			.completed-state h3 {
				margin: 0;
				font-size: 1rem;
			}
			.completed-state p {
				margin: 0;
				font-size: 0.88rem;
				color: var(--color-text-muted);
			}
			.btn-restart {
				justify-self: start;
				border: 1px solid rgb(255 138 0 / 0.45);
				background: rgb(255 138 0 / 0.14);
				color: #ffd08a;
				border-radius: 999px;
				padding: 0.38rem 0.8rem;
				font-size: 0.82rem;
				font-weight: 700;
				cursor: pointer;
			}
			.cover-completed-overlay {
				position: absolute;
				inset: 0;
				background: rgb(2 6 23 / 0.48);
				color: #e2fbe8;
				display: grid;
				place-content: center;
				gap: 0.18rem;
				text-align: center;
				font-weight: 800;
				letter-spacing: 0.01em;
				border-radius: 0.8rem;
				z-index: 2;
			}
			.cover-completed-overlay .check {
				font-size: 1.6rem;
				line-height: 1;
				color: #22c55e;
			}
			app-player-controls {
				width: auto;
				max-width: none;
			}
			.error { color: var(--color-danger); }
			.details {
				display: grid;
				gap: 1rem;
				width: 100%;
				background: linear-gradient(145deg, #141414, #101010 74%);
				border-radius: 1rem;
			}
			.details-head {
				display: flex;
				align-items: start;
				justify-content: space-between;
				gap: 0.8rem;
			}
			.eyebrow {
				margin: 0 0 0.2rem;
				font-size: 0.74rem;
				text-transform: uppercase;
				letter-spacing: 0.08em;
				color: var(--color-text-muted);
			}
			.details-head h2,
			.detail-card h3,
			.description h3 {
				margin: 0;
			}
			.detail-grid {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
				gap: 0.75rem;
			}
			.detail-card {
				display: grid;
				gap: 0.3rem;
				padding: 0.9rem;
				border: 1px solid var(--color-border);
				border-radius: 0.85rem;
				background: linear-gradient(180deg, #171717, #111111);
			}
			.detail-card h3 {
				font-size: 0.78rem;
				text-transform: uppercase;
				letter-spacing: 0.05em;
				color: var(--color-text-muted);
			}
			.detail-card p,
			.description p {
				margin: 0;
				color: var(--color-text);
			}
			.description {
				display: grid;
				gap: 0.45rem;
				padding: 1rem;
				border: 1px solid var(--color-border);
				border-radius: 0.85rem;
				background: linear-gradient(180deg, #171717, #111111);
			}
			.description p {
				line-height: 1.7;
				white-space: pre-line;
			}
			.empty-description p {
				color: var(--color-text-muted);
			}

			@media (max-width: 820px) {
				.hero {
					grid-template-columns: 1fr;
					justify-items: center;
					text-align: center;
				}
				.meta {
					width: 100%;
				}
				.cover-wrap {
					width: min(230px, 100%);
					height: auto;
					aspect-ratio: 1 / 1;
				}
				.progress-head {
					flex-direction: column;
					align-items: stretch;
				}
				.controls-row {
					justify-content: center;
				}
				.cover-overlay-actions {
					top: 0.45rem;
					right: 0.45rem;
				}
				.details-head {
					flex-direction: column;
					align-items: stretch;
				}
			}
		`,
	],
})
export class PlayerPage implements OnInit, OnDestroy {
	readonly book = signal<Book | null>(null);
	readonly chapters = signal<Chapter[]>([]);
	readonly coverUrl = signal('');
	readonly activeChapterIndex = signal(0);
	readonly progressMode = signal<'chapter' | 'book'>('chapter');
	readonly progressMenuOpen = signal(false);
	readonly sleepTimerMode = signal<SleepTimerMode>('off');
	readonly sleepUiNow = signal(Date.now());
	readonly isCompleted = signal(false);
	readonly error = signal<string | null>(null);

	private readonly bookId: string;
	private sleepUiTicker?: Subscription;
	private resumeAt = 0;
	private sleepTimerTimeout?: ReturnType<typeof setTimeout>;
	private sleepRemainingMs: number | null = null;
	private sleepStartedAtMs: number | null = null;
	private sleepPausedAtMs: number | null = null;
	private sleepChapterTargetSeconds: number | null = null;
	private resumeLoaded = false;
	private progressLoaded = false;
	private initialPositionApplied = false;
	private lastPausedState = true;

	constructor(
		route: ActivatedRoute,
		private readonly library: LibraryService,
		protected readonly player: PlayerService,
		private readonly progress: ProgressService,
		private readonly settings: SettingsService,
		protected readonly auth: AuthService,
	) {
		this.bookId = route.snapshot.paramMap.get('bookId') ?? '';

		effect(() => {
			this.chapters.set(this.player.chapters());
		});

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

	ngOnInit(): void {
		this.progressMode.set('chapter');

		if (!this.bookId) {
			this.error.set('Missing book id');
			return;
		}

		this.library.getBook(this.bookId).subscribe({
			next: (book) => {
				const hasActiveSession = this.player.currentBook()?.id === book.id && this.player.currentSeconds() > 0;
				this.book.set(book);
				const coverUrl = this.computeCoverUrl(book);
				this.coverUrl.set(coverUrl);
				this.player.loadBook(book, { coverUrl });
				if (hasActiveSession) {
					this.initialPositionApplied = true;
				}
				this.loadResumeInfo(book);
			},
			error: (error: unknown) => {
				if (error instanceof HttpErrorResponse && error.status === 404) {
					this.error.set('Book not found. It may have been deleted or the database was reset.');
					return;
				}
				this.error.set('Unable to load book details');
			},
		});

		this.sleepUiTicker = interval(1000).subscribe(() => {
			this.sleepUiNow.set(Date.now());
		});
		this.loadPlayerSettings();
	}

	private loadPlayerSettings(): void {
		this.settings.getMine().subscribe({
			next: (settings) => {
				this.player.setJumpSeconds(
					settings.player.backwardJumpSeconds ?? 15,
					settings.player.forwardJumpSeconds ?? 30,
				);
				this.sleepTimerMode.set(settings.player.sleepTimerMode ?? 'off');
				this.resetSleepTimerForMode();
			},
			error: () => {
				this.player.setJumpSeconds(15, 30);
				this.sleepTimerMode.set('off');
				this.resetSleepTimerForMode();
			},
		});
	}

	private loadResumeInfo(book: Book): void {
		this.player.getResumeInfo(this.bookId).subscribe({
			next: (resume) => {
				this.resumeAt = resume.startSeconds;
				this.resumeLoaded = true;
				this.applyInitialPositionIfReady(book);
			},
			error: (error: unknown) => {
				this.resumeLoaded = true;
				if (error instanceof HttpErrorResponse && error.status === 404) {
					this.applyInitialPositionIfReady(book);
					return;
				}
				this.error.set('Unable to load resume information');
				this.applyInitialPositionIfReady(book);
			},
		});

		this.progress.getForBook(this.bookId).subscribe({
			next: (prog) => {
				this.isCompleted.set(prog.completed);
				this.progressLoaded = true;
				this.applyInitialPositionIfReady(book);
			},
			error: () => {
				// no progress record yet — not completed
				this.isCompleted.set(false);
				this.progressLoaded = true;
				this.applyInitialPositionIfReady(book);
			},
		});
	}

	private applyInitialPositionIfReady(book: Book): void {
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
		this.sleepUiTicker?.unsubscribe();
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

	markCompleted(): void {
		this.progressMenuOpen.set(false);
		const duration = this.player.durationSeconds() > 0 ? Math.floor(this.player.durationSeconds()) : 0;

		if (duration > 0) {
			this.player.pause();
			this.player.setCurrentTime(duration);
		}

		const finalizeMark = () => {
			this.progress.markCompleted(this.bookId).subscribe({
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
			.subscribe({
				next: () => finalizeMark(),
				error: () => finalizeMark(),
			});
	}

	restartBook(): void {
		this.progressMenuOpen.set(false);
		this.progress.unmarkCompleted(this.bookId).subscribe({
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

		this.settings.updateMine({ player: { sleepTimerMode: mode } }).subscribe({
			error: () => {
				this.error.set('Unable to save sleep timer preference');
			},
		});
	}

	sleepTimerLabel(): string {
		switch (this.sleepTimerMode()) {
			case '15m':
				return '15 min';
			case '30m':
				return '30 min';
			case '45m':
				return '45 min';
			case '60m':
				return '1 h';
			case 'chapter':
				return 'End chapter';
			default:
				return 'Disabled';
		}
	}

	sleepTimerCountdownText(): string | null {
		this.sleepUiNow();

		const mode = this.sleepTimerMode();
		if (mode === 'off') {
			return null;
		}

		if (mode === 'chapter') {
			return 'Chapter end';
		}

		if (this.sleepRemainingMs === null) {
			return null;
		}

		let remainingMs = this.sleepRemainingMs;
		if (this.sleepStartedAtMs !== null) {
			remainingMs = Math.max(0, remainingMs - (Date.now() - this.sleepStartedAtMs));
		}

		const totalSeconds = Math.ceil(remainingMs / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;

		return `${minutes}:${String(seconds).padStart(2, '0')}`;
	}

	onProgressInput(event: Event): void {
		const value = Number((event.target as HTMLInputElement | null)?.value);
		if (!Number.isFinite(value)) {
			return;
		}

		let target = value;
		if (this.progressMode() === 'chapter') {
			const chapter = this.chapters()[this.activeChapterIndex()];
			if (chapter) {
				const start = this.chapterStartSeconds(chapter);
				const end = this.chapterEndSeconds(chapter);
				target = Math.max(start, Math.min(start + value, Math.max(start, end - 0.25)));
			}
		}

		this.player.setCurrentTime(target);
		this.refreshChapterSleepTargetIfNeeded();
	}

	progressRangeMin(): number {
		return 0;
	}

	progressRangeMax(): number {
		if (this.progressMode() === 'book') {
			return Math.max(1, this.player.durationSeconds());
		}

		const chapter = this.chapters()[this.activeChapterIndex()];
		if (!chapter) {
			return Math.max(1, this.player.durationSeconds());
		}

		return Math.max(1, Math.floor(this.chapterDurationSeconds(chapter)));
	}

	progressSliderValue(): number {
		const current = this.player.currentSeconds();
		if (this.progressMode() === 'book') {
			return Math.max(0, Math.min(current, this.progressRangeMax()));
		}

		const chapter = this.chapters()[this.activeChapterIndex()];
		if (!chapter) {
			return Math.max(0, Math.min(current, this.progressRangeMax()));
		}

		const offset = current - this.chapterStartSeconds(chapter);
		return Math.max(0, Math.min(offset, this.progressRangeMax()));
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
		if (this.progressMode() === 'book') {
			return 0;
		}

		const chapter = this.chapters()[this.activeChapterIndex()];
		if (!chapter) {
			return 0;
		}

		return Math.floor(this.chapterStartSeconds(chapter));
	}

	progressMax(): number {
		if (this.progressMode() === 'book') {
			return Math.max(1, this.player.durationSeconds());
		}

		const chapter = this.chapters()[this.activeChapterIndex()];
		if (!chapter) {
			return Math.max(1, this.player.durationSeconds());
		}

		return Math.max(this.progressMin() + 1, Math.floor(this.chapterEndSeconds(chapter) - 0.001));
	}

	progressValue(): number {
		const current = this.player.currentSeconds();
		if (current < this.progressMin()) {
			return this.progressMin();
		}
		if (current > this.progressMax()) {
			return this.progressMax();
		}
		return current;
	}

	formatTime(totalSeconds: number): string {
		const value = Math.max(0, Math.floor(totalSeconds));
		const hours = Math.floor(value / 3600);
		const minutes = Math.floor((value % 3600) / 60);
		const seconds = value % 60;

		if (hours > 0) {
			return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
		}

		return `${minutes}:${String(seconds).padStart(2, '0')}`;
	}

	formatLongDuration(totalSeconds: number): string {
		const value = Math.max(0, Math.floor(totalSeconds));
		const hours = Math.floor(value / 3600);
		const minutes = Math.floor((value % 3600) / 60);

		if (hours <= 0) {
			return `${minutes} min`;
		}

		if (minutes === 0) {
			return `${hours} hr`;
		}

		return `${hours} hr ${minutes} min`;
	}

	resolvedDescription(): string | null {
		const description = this.book()?.description;
		if (!description) {
			return null;
		}

		return description.default?.trim() || description.en?.trim() || description.fr?.trim() || null;
	}

	coverInitials(title: string): string {
		const initials = title
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');

		return initials || 'BK';
	}

	private computeCoverUrl(book: Book): string {
		if (!book.coverPath) {
			return '';
		}

		const token = this.auth.accessToken();
		if (!token) {
			return '';
		}

		return `/streaming/books/${book.id}/cover?access_token=${encodeURIComponent(token)}`;
	}

	private updateActiveChapterFromCurrentTime(current: number): void {
		const chapters = this.chapters();
		if (chapters.length === 0) {
			this.activeChapterIndex.set(0);
			return;
		}

		const index = chapters.findIndex((chapter, chapterIndex) => {
			const start = this.chapterStartSeconds(chapter);
			const end = this.chapterEndSeconds(chapter);
			const isLast = chapterIndex === chapters.length - 1;
			return current >= start && (isLast ? current <= end : current < end);
		});

		this.activeChapterIndex.set(index >= 0 ? index : chapters.length - 1);
	}

	private handleSleepTimerTick(currentTime: number): void {
		if (this.sleepTimerMode() !== 'chapter') {
			return;
		}

		const target = this.sleepChapterTargetSeconds;
		if (target === null) {
			return;
		}

		if (this.player.paused()) {
			return;
		}

		if (currentTime >= target) {
			this.player.pause();
			this.sleepChapterTargetSeconds = null;
		}
	}

	private refreshChapterSleepTargetIfNeeded(): void {
		if (this.sleepTimerMode() !== 'chapter') {
			return;
		}

		if (this.player.paused()) {
			return;
		}

		this.armChapterSleepTarget();
	}

	private armSleepTimerForPlayback(): void {
		const mode = this.sleepTimerMode();
		if (mode === 'off') {
			this.sleepPausedAtMs = null;
			return;
		}

		if (mode === 'chapter') {
			this.sleepPausedAtMs = null;
			this.armChapterSleepTarget();
			return;
		}

		if (
			this.sleepPausedAtMs !== null &&
			Date.now() - this.sleepPausedAtMs > SLEEP_TIMER_PAUSE_RESET_MS
		) {
			this.sleepRemainingMs = SLEEP_TIMER_MINUTES[mode] * 60_000;
		}

		this.sleepPausedAtMs = null;

		if (this.sleepRemainingMs === null || this.sleepRemainingMs <= 0) {
			this.sleepRemainingMs = SLEEP_TIMER_MINUTES[mode] * 60_000;
		}

		this.clearSleepTimerTimeout();
		this.sleepStartedAtMs = Date.now();
		this.sleepTimerTimeout = setTimeout(() => {
			this.triggerSleepPause();
		}, this.sleepRemainingMs);
	}

	private pauseSleepTimerCountdown(): void {
		if (this.sleepTimerMode() === 'chapter') {
			this.sleepPausedAtMs = Date.now();
			return;
		}

		if (this.sleepStartedAtMs !== null && this.sleepRemainingMs !== null) {
			const elapsed = Date.now() - this.sleepStartedAtMs;
			this.sleepRemainingMs = Math.max(0, this.sleepRemainingMs - elapsed);
		}

		this.clearSleepTimerTimeout();
		this.sleepStartedAtMs = null;
		this.sleepPausedAtMs = Date.now();
	}

	private triggerSleepPause(): void {
		this.clearSleepTimerTimeout();
		this.sleepStartedAtMs = null;
		this.sleepPausedAtMs = Date.now();
		this.sleepRemainingMs = 0;

		this.player.pause();
	}

	private armChapterSleepTarget(): void {
		const chapter = this.chapters()[this.activeChapterIndex()];
		if (!chapter) {
			this.sleepChapterTargetSeconds = null;
			return;
		}

		this.sleepChapterTargetSeconds = this.chapterEndSeconds(chapter);
	}

	private resetSleepTimerForMode(): void {
		this.clearSleepTimerTimeout();
		this.sleepStartedAtMs = null;
		this.sleepPausedAtMs = null;
		this.sleepChapterTargetSeconds = null;

		const mode = this.sleepTimerMode();
		if (mode === 'off' || mode === 'chapter') {
			this.sleepRemainingMs = null;
		} else {
			this.sleepRemainingMs = SLEEP_TIMER_MINUTES[mode] * 60_000;
		}

		if (!this.player.paused()) {
			this.armSleepTimerForPlayback();
		}
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

	@HostListener('window:keydown', ['$event'])
	onKeyDown(event: KeyboardEvent): void {
		const target = event.target as HTMLElement | null;
		const tag = target?.tagName.toLowerCase();
		if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
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

	private clearSleepTimerTimeout(): void {
		if (!this.sleepTimerTimeout) {
			return;
		}

		clearTimeout(this.sleepTimerTimeout);
		this.sleepTimerTimeout = undefined;
	}

	private chapterStartSeconds(chapter: Chapter): number {
		return chapter.start;
	}

	private chapterEndSeconds(chapter: Chapter): number {
		return chapter.end;
	}

	private chapterDurationSeconds(chapter: Chapter): number {
		return Math.max(1, this.chapterEndSeconds(chapter) - this.chapterStartSeconds(chapter));
	}

}
