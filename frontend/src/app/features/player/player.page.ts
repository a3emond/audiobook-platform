import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { interval, Subscription } from 'rxjs';

import type { Book, Chapter } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { LibraryService } from '../../core/services/library.service';
import { PlayerService } from '../../core/services/player.service';
import { ProgressService } from '../../core/services/progress.service';
import { StatsService } from '../../core/services/stats.service';
import { PlayerControlsComponent } from './controls';

@Component({
	selector: 'app-player-page',
	standalone: true,
	imports: [CommonModule, PlayerControlsComponent],
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
						</div>

						<div class="progress-panel">
							<input
								type="range"
								[min]="progressMin()"
								[max]="progressMax()"
								[step]="1"
								[value]="progressValue()"
								(input)="onProgressInput($event)"
							/>
							<div class="times">
								<span>{{ formatTime(progressValue() - progressMin()) }}</span>
								<span>{{ formatTime(progressMax() - progressMin()) }}</span>
							</div>

							<div class="controls-row">
								<app-player-controls
									[paused]="audioRef?.nativeElement?.paused ?? true"
									(toggle)="togglePlay()"
									(seek)="seek($event)"
								/>

								<div class="menu-wrap controls-menu-wrap">
									<button
										type="button"
										class="btn-menu btn-menu-compact"
										(click)="toggleProgressMenu()"
										aria-label="Playback options"
										title="Playback options"
									>
										...
									</button>
									<div class="menu" *ngIf="progressMenuOpen()">
										<button type="button" (click)="setProgressMode('chapter')">
											Track chapter progress {{ progressMode() === 'chapter' ? '✓' : '' }}
										</button>
										<button type="button" (click)="setProgressMode('book')">
											Track book progress {{ progressMode() === 'book' ? '✓' : '' }}
										</button>
									</div>
								</div>
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

			<audio
				#audio
				[src]="streamUrl()"
				(loadedmetadata)="onLoadedMetadata()"
				(timeupdate)="onTimeUpdate()"
				(play)="onPlay()"
				(pause)="onPause()"
				(ended)="onEnded()"
				class="native-audio"
			></audio>

			<p *ngIf="error()" class="error">{{ error() }}</p>
		</section>
	`,
	styles: [
		`
			.page {
				display: grid;
				gap: 1rem;
			}
			.player-page {
				max-width: 960px;
				margin: 0 auto;
				justify-items: center;
			}
			.hero {
				display: grid;
				grid-template-columns: 190px 1fr;
				gap: 1rem;
				align-items: start;
				width: 100%;
				padding: 1rem;
				background: linear-gradient(140deg, #ffffff, #f8fafc);
				border: 1px solid var(--color-border);
				border-radius: 1rem;
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
				background: linear-gradient(135deg, #1d4ed8, #0f172a 78%);
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
			.progress-head {
				margin-top: 0.85rem;
				display: flex;
				align-items: start;
				justify-content: flex-start;
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
			.menu-wrap {
				position: relative;
			}
			.btn-menu {
				border: 1px solid #d6deeb;
				background: #fff;
				border-radius: 999px;
				padding: 0.45rem 0.95rem;
				font-weight: 700;
				cursor: pointer;
			}
			.btn-menu-compact {
				width: 2.2rem;
				height: 2.2rem;
				padding: 0;
				line-height: 1;
				font-size: 1.1rem;
				display: inline-grid;
				place-items: center;
			}
			.controls-menu-wrap .menu {
				right: 0;
				top: calc(100% + 0.35rem);
			}
			.menu {
				position: absolute;
				right: 0;
				top: calc(100% + 0.3rem);
				background: #fff;
				border: 1px solid var(--color-border);
				border-radius: 0.5rem;
				box-shadow: var(--shadow-sm);
				display: grid;
				min-width: 220px;
				overflow: hidden;
			}
			.menu button {
				border: none;
				text-align: left;
				padding: 0.55rem 0.7rem;
				background: #fff;
			}
			.menu button:hover {
				background: #f8fafc;
			}
			.btn-complete {
				border: 1px solid rgb(15 118 110 / 0.2);
				border-radius: 999px;
				padding: 0.14rem 0.48rem;
				font-size: 0.64rem;
				font-weight: 700;
				cursor: pointer;
				background: rgb(255 255 255 / 0.84);
				color: #0f766e;
				backdrop-filter: blur(2px);
			}
			.btn-complete.secondary {
				background: rgb(224 231 255 / 0.9);
				color: #1e3a8a;
				border: 1px solid #a5b4fc;
			}
			.completed-state {
				margin-top: 0.95rem;
				border: 1px solid #d8e2ee;
				border-radius: 0.85rem;
				background: linear-gradient(180deg, #fff, #f8fbff);
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
				color: #52637a;
			}
			.btn-restart {
				justify-self: start;
				border: 1px solid #a5b4fc;
				background: #eef2ff;
				color: #1e3a8a;
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
			.native-audio {
				position: absolute;
				width: 1px;
				height: 1px;
				opacity: 0;
				pointer-events: none;
			}
			app-player-controls {
				width: auto;
				max-width: none;
			}
			.error { color: #b81f24; }

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
			}
		`,
	],
})
export class PlayerPage implements OnInit, OnDestroy {
	@ViewChild('audio') audioRef?: ElementRef<HTMLAudioElement>;

	readonly book = signal<Book | null>(null);
	readonly chapters = signal<Chapter[]>([]);
	readonly streamUrl = signal<string>('');
	readonly coverUrl = signal('');
	readonly durationSeconds = signal(0);
	readonly currentSeconds = signal(0);
	readonly activeChapterIndex = signal(0);
	readonly progressMode = signal<'chapter' | 'book'>('chapter');
	readonly progressMenuOpen = signal(false);
	readonly isCompleted = signal(false);
	readonly error = signal<string | null>(null);

	private readonly bookId: string;
	private progressTicker?: Subscription;
	private resumeAt = 0;
	private sessionStartedAt: Date | null = null;
	private sessionStartPosition = 0;

	constructor(
		route: ActivatedRoute,
		private readonly library: LibraryService,
		private readonly player: PlayerService,
		private readonly progress: ProgressService,
		private readonly stats: StatsService,
		private readonly auth: AuthService,
	) {
		this.bookId = route.snapshot.paramMap.get('bookId') ?? '';
	}

	ngOnInit(): void {
		if (!this.bookId) {
			this.error.set('Missing book id');
			return;
		}

		this.library.getBook(this.bookId).subscribe({
			next: (book) => {
				this.book.set(book);
				this.chapters.set(book.chapters ?? []);
				this.streamUrl.set(this.player.streamUrl(this.bookId));
				this.coverUrl.set(this.computeCoverUrl(book));
				this.loadResumeInfo();
			},
			error: (error: unknown) => {
				if (error instanceof HttpErrorResponse && error.status === 404) {
					this.error.set('Book not found. It may have been deleted or the database was reset.');
					return;
				}
				this.error.set('Unable to load book details');
			},
		});

		this.progressTicker = interval(15000).subscribe(() => this.persistProgress());
	}

	private loadResumeInfo(): void {
		this.player.getResumeInfo(this.bookId).subscribe({
			next: (resume) => {
				this.resumeAt = resume.startSeconds;
			},
			error: (error: unknown) => {
				if (error instanceof HttpErrorResponse && error.status === 404) {
					return;
				}
				this.error.set('Unable to load resume information');
			},
		});

		this.progress.getForBook(this.bookId).subscribe({
			next: (prog) => {
				this.isCompleted.set(prog.completed);
			},
			error: () => {
				// no progress record yet — not completed
				this.isCompleted.set(false);
			},
		});
	}

	ngOnDestroy(): void {
		this.flushListeningSession();
		this.persistProgress();
		this.progressTicker?.unsubscribe();
	}

	onLoadedMetadata(): void {
		const audio = this.audioRef?.nativeElement;
		if (!audio) {
			return;
		}

		if (this.isCompleted() && Number.isFinite(audio.duration) && audio.duration > 0) {
			audio.currentTime = audio.duration;
		} else if (this.resumeAt > 0) {
			audio.currentTime = this.resumeAt;
		}

		this.durationSeconds.set(Number.isFinite(audio.duration) ? Math.floor(audio.duration) : 0);
		this.currentSeconds.set(Math.floor(audio.currentTime));
		this.updateActiveChapterFromCurrentTime();
	}

	onTimeUpdate(): void {
		const audio = this.audioRef?.nativeElement;
		if (!audio) {
			return;
		}

		this.currentSeconds.set(Math.floor(audio.currentTime));
		if (Number.isFinite(audio.duration)) {
			this.durationSeconds.set(Math.floor(audio.duration));
		}
		this.updateActiveChapterFromCurrentTime();
	}

	togglePlay(): void {
		const audio = this.audioRef?.nativeElement;
		if (!audio) {
			return;
		}

		if (audio.paused) {
			void audio.play();
		} else {
			audio.pause();
		}
	}

	onPlay(): void {
		const audio = this.audioRef?.nativeElement;
		if (!audio || this.sessionStartedAt) {
			return;
		}

		this.sessionStartedAt = new Date();
		this.sessionStartPosition = audio.currentTime;
	}

	onPause(): void {
		this.flushListeningSession();
	}

	onEnded(): void {
		this.flushListeningSession();
	}

	seek(deltaSeconds: number): void {
		const audio = this.audioRef?.nativeElement;
		if (!audio) {
			return;
		}

		audio.currentTime = Math.max(0, audio.currentTime + deltaSeconds);
		this.currentSeconds.set(Math.floor(audio.currentTime));
		this.updateActiveChapterFromCurrentTime();
	}

	onChapterSelected(event: Event): void {
		const value = Number((event.target as HTMLSelectElement | null)?.value);
		if (!Number.isFinite(value)) {
			return;
		}

		const chapter = this.chapters()[value];
		const audio = this.audioRef?.nativeElement;
		if (!chapter || !audio) {
			return;
		}

		audio.currentTime = this.chapterStartSeconds(chapter);
		this.currentSeconds.set(Math.floor(audio.currentTime));
		this.activeChapterIndex.set(value);
	}

	toggleProgressMenu(): void {
		this.progressMenuOpen.update((open) => !open);
	}

	markCompleted(): void {
		this.progressMenuOpen.set(false);
		const audio = this.audioRef?.nativeElement;
		const duration = audio && Number.isFinite(audio.duration) && audio.duration > 0 ? Math.floor(audio.duration) : 0;

		if (audio && duration > 0) {
			audio.pause();
			audio.currentTime = duration;
			this.currentSeconds.set(duration);
			this.durationSeconds.set(duration);
		}

		const finalizeMark = () => {
			this.progress.markCompleted(this.bookId).subscribe({
				next: (prog) => {
					this.isCompleted.set(prog.completed);
					if (prog.completed) {
						const currentAudio = this.audioRef?.nativeElement;
						if (currentAudio && Number.isFinite(currentAudio.duration) && currentAudio.duration > 0) {
							this.currentSeconds.set(Math.floor(currentAudio.duration));
						}
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
				const audio = this.audioRef?.nativeElement;
				if (audio) {
					audio.currentTime = 0;
					this.currentSeconds.set(0);
				}

				if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
					const idempotencyKey = `${this.bookId}:manual-restart:${Date.now()}`;
					this.progress
						.saveForBook(
							this.bookId,
							{
								positionSeconds: 0,
								durationAtSave: Math.floor(audio.duration),
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

	onProgressInput(event: Event): void {
		const value = Number((event.target as HTMLInputElement | null)?.value);
		if (!Number.isFinite(value)) {
			return;
		}

		const audio = this.audioRef?.nativeElement;
		if (!audio) {
			return;
		}

		audio.currentTime = value;
		this.currentSeconds.set(Math.floor(audio.currentTime));
		this.updateActiveChapterFromCurrentTime();
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
			return Math.max(1, this.durationSeconds());
		}

		const chapter = this.chapters()[this.activeChapterIndex()];
		if (!chapter) {
			return Math.max(1, this.durationSeconds());
		}

		return Math.max(this.progressMin() + 1, Math.floor(this.chapterEndSeconds(chapter)));
	}

	progressValue(): number {
		const current = this.currentSeconds();
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

	coverInitials(title: string): string {
		const initials = title
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');

		return initials || 'BK';
	}

	private persistProgress(): void {
		const audio = this.audioRef?.nativeElement;
		if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
			return;
		}

		const idempotencyKey = `${this.bookId}:${Math.floor(Date.now() / 15000)}`;
		this.progress
			.saveForBook(
				this.bookId,
				{
					positionSeconds: Math.floor(audio.currentTime),
					durationAtSave: Math.floor(audio.duration),
				},
				idempotencyKey,
			)
			.subscribe({ error: () => undefined });
	}

	private flushListeningSession(): void {
		const audio = this.audioRef?.nativeElement;
		if (!audio || !this.sessionStartedAt) {
			return;
		}

		const startedAt = this.sessionStartedAt;
		const startPosition = this.sessionStartPosition;
		const endPosition = audio.currentTime;
		const listenedSeconds = Math.max(0, Math.round(endPosition - startPosition));

		this.sessionStartedAt = null;
		this.sessionStartPosition = endPosition;

		if (listenedSeconds < 3) {
			return;
		}

		this.stats
			.createSession(
				{
					bookId: this.bookId,
					startedAt: startedAt.toISOString(),
					endedAt: new Date().toISOString(),
					listenedSeconds,
					startPositionSeconds: Math.floor(startPosition),
					endPositionSeconds: Math.floor(endPosition),
					device: 'web',
				},
				`${this.bookId}:session:${startedAt.getTime()}`,
			)
			.subscribe({ error: () => undefined });
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

	private updateActiveChapterFromCurrentTime(): void {
		const chapters = this.chapters();
		if (chapters.length === 0) {
			this.activeChapterIndex.set(0);
			return;
		}

		const current = this.currentSeconds();
		const index = chapters.findIndex((chapter) => {
			const start = this.chapterStartSeconds(chapter);
			const end = this.chapterEndSeconds(chapter);
			return current >= start && current < end;
		});

		this.activeChapterIndex.set(index >= 0 ? index : chapters.length - 1);
	}

	private chapterStartSeconds(chapter: Chapter): number {
		return this.shouldConvertChapterTimesToSeconds(chapter) ? chapter.start / 1000 : chapter.start;
	}

	private chapterEndSeconds(chapter: Chapter): number {
		return this.shouldConvertChapterTimesToSeconds(chapter) ? chapter.end / 1000 : chapter.end;
	}

	private shouldConvertChapterTimesToSeconds(chapter: Chapter): boolean {
		return chapter.end > 10000;
	}
}
