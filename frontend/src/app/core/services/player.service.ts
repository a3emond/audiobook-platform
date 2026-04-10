import { computed, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

import type { Book, Chapter, ResumeInfo } from '../models/api.models';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ProgressService } from './progress.service';
import { StatsService } from './stats.service';

@Injectable({ providedIn: 'root' })
export class PlayerService {
	readonly currentBook = signal<Book | null>(null);
	readonly chapters = signal<Chapter[]>([]);
	readonly coverUrl = signal('');
	readonly currentSeconds = signal(0);
	readonly durationSeconds = signal(0);
	readonly paused = signal(true);
	readonly metadataLoaded = signal(false);
	readonly error = signal<string | null>(null);
	readonly hasActiveBook = computed(() => Boolean(this.currentBook()));

	private readonly audio = new Audio();
	private pendingInitialPosition: number | null = null;
	private progressSaveTimer?: ReturnType<typeof setInterval>;
	private sessionStartedAt: Date | null = null;
	private sessionStartPosition = 0;

	constructor(
		private readonly api: ApiService,
		private readonly auth: AuthService,
		private readonly progress: ProgressService,
		private readonly stats: StatsService,
	) {
		this.configureAudioEvents();
		this.configureMediaSessionActions();
	}

	getResumeInfo(bookId: string): Observable<ResumeInfo> {
		return this.api.get<ResumeInfo>(`/streaming/books/${bookId}/resume`);
	}

	streamUrl(bookId: string): string {
		const token = this.auth.accessToken();
		const base = `/streaming/books/${bookId}/audio`;
		if (!token) {
			return base;
		}

		return `${base}?access_token=${encodeURIComponent(token)}`;
	}

	loadBook(book: Book, options?: { startSeconds?: number; coverUrl?: string; forceReload?: boolean }): void {
		const current = this.currentBook();
		const sameBook = current?.id === book.id;
		const shouldReload = options?.forceReload || !sameBook;

		this.currentBook.set(book);
		this.chapters.set(book.chapters ?? []);
		this.coverUrl.set(options?.coverUrl ?? this.coverUrl());
		this.error.set(null);

		if (!shouldReload) {
			if (typeof options?.startSeconds === 'number' && !this.metadataLoaded()) {
				this.pendingInitialPosition = Math.max(0, options.startSeconds);
			}
			this.updateMediaSessionMetadata();
			return;
		}

		this.flushListeningSession();
		this.stopProgressSaveTicker();
		this.pause();

		this.metadataLoaded.set(false);
		this.pendingInitialPosition = Math.max(0, options?.startSeconds ?? 0);
		this.durationSeconds.set(Math.max(0, Math.floor(book.duration || 0)));
		this.currentSeconds.set(Math.floor(this.pendingInitialPosition));

		this.audio.src = this.streamUrl(book.id);
		this.audio.load();
		this.updateMediaSessionMetadata();
	}

	setInitialPosition(seconds: number): void {
		const value = Math.max(0, seconds);
		if (!this.metadataLoaded()) {
			this.pendingInitialPosition = value;
			return;
		}

		this.setCurrentTime(value);
	}

	togglePlay(): void {
		if (this.audio.paused) {
			this.play();
			return;
		}

		this.pause();
	}

	play(): void {
		void this.audio.play().catch(() => {
			this.error.set('Playback was blocked by the browser. Interact with the page and try again.');
		});
	}

	pause(): void {
		if (!this.audio.paused) {
			this.audio.pause();
		}
	}

	seek(deltaSeconds: number): void {
		this.setCurrentTime(this.audio.currentTime + deltaSeconds);
	}

	setCurrentTime(seconds: number): void {
		const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : Number.POSITIVE_INFINITY;
		const clamped = Math.max(0, Math.min(seconds, duration));
		this.audio.currentTime = clamped;
		this.currentSeconds.set(Math.floor(clamped));
		this.updateMediaSessionPosition();
	}

	jumpToChapter(index: number): void {
		const chapters = this.chapters();
		const chapter = chapters[index];
		if (!chapter) {
			return;
		}

		this.setCurrentTime(this.chapterStartSeconds(chapter));
	}

	jumpToPreviousChapter(): void {
		const chapters = this.chapters();
		if (chapters.length === 0) {
			return;
		}

		const index = this.currentChapterIndex();
		if (index <= 0) {
			this.setCurrentTime(0);
			return;
		}

		const currentStart = this.chapterStartSeconds(chapters[index]);
		if (this.audio.currentTime - currentStart > 3) {
			this.setCurrentTime(currentStart);
			return;
		}

		this.jumpToChapter(index - 1);
	}

	jumpToNextChapter(): void {
		const chapters = this.chapters();
		if (chapters.length === 0) {
			return;
		}

		const index = this.currentChapterIndex();
		if (index >= chapters.length - 1) {
			return;
		}

		this.jumpToChapter(index + 1);
	}

	currentChapterIndex(): number {
		const chapters = this.chapters();
		if (chapters.length === 0) {
			return 0;
		}

		const current = this.currentSeconds();
		for (let index = 0; index < chapters.length; index += 1) {
			const chapter = chapters[index];
			const start = this.chapterStartSeconds(chapter);
			const end = this.chapterEndSeconds(chapter);
			const isLast = index === chapters.length - 1;
			if (current >= start && (isLast ? current <= end : current < end)) {
				return index;
			}
		}

		return chapters.length - 1;
	}

	persistNow(): void {
		void this.persistProgress();
	}

	private configureAudioEvents(): void {
		this.audio.addEventListener('loadedmetadata', () => {
			this.metadataLoaded.set(true);
			if (this.pendingInitialPosition !== null) {
				this.setCurrentTime(this.pendingInitialPosition);
				this.pendingInitialPosition = null;
			}

			if (Number.isFinite(this.audio.duration)) {
				this.durationSeconds.set(Math.floor(this.audio.duration));
			}
			this.currentSeconds.set(Math.floor(this.audio.currentTime));
			this.updateMediaSessionPosition();
		});

		this.audio.addEventListener('timeupdate', () => {
			this.currentSeconds.set(Math.floor(this.audio.currentTime));
			if (Number.isFinite(this.audio.duration)) {
				this.durationSeconds.set(Math.floor(this.audio.duration));
			}
			this.updateMediaSessionPosition();
		});

		this.audio.addEventListener('play', () => {
			this.paused.set(false);
			if (!this.sessionStartedAt) {
				this.sessionStartedAt = new Date();
				this.sessionStartPosition = this.audio.currentTime;
			}
			this.startProgressSaveTicker();
			this.updateMediaSessionMetadata();
		});

		this.audio.addEventListener('pause', () => {
			this.paused.set(true);
			this.flushListeningSession();
			this.stopProgressSaveTicker();
			void this.persistProgress();
			this.updateMediaSessionMetadata();
		});

		this.audio.addEventListener('ended', () => {
			this.paused.set(true);
			this.flushListeningSession();
			this.stopProgressSaveTicker();
			void this.persistProgress();
			this.updateMediaSessionMetadata();
		});

		this.audio.addEventListener('error', () => {
			this.error.set('Unable to play this audio stream right now.');
		});
	}

	private configureMediaSessionActions(): void {
		if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
			return;
		}

		const mediaSession = navigator.mediaSession;
		try {
			mediaSession.setActionHandler('play', () => this.play());
			mediaSession.setActionHandler('pause', () => this.pause());
			mediaSession.setActionHandler('seekbackward', (details) => this.seek(-(details.seekOffset ?? 15)));
			mediaSession.setActionHandler('seekforward', (details) => this.seek(details.seekOffset ?? 30));
			mediaSession.setActionHandler('seekto', (details) => {
				if (typeof details.seekTime === 'number') {
					this.setCurrentTime(details.seekTime);
				}
			});
			mediaSession.setActionHandler('previoustrack', () => this.jumpToPreviousChapter());
			mediaSession.setActionHandler('nexttrack', () => this.jumpToNextChapter());
		} catch {
			// Browsers may throw for unsupported actions.
		}
	}

	private updateMediaSessionMetadata(): void {
		if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
			return;
		}

		const book = this.currentBook();
		if (!book) {
			return;
		}

		navigator.mediaSession.metadata = new MediaMetadata({
			title: book.title,
			artist: book.author,
			album: book.series ?? 'StoryWave',
			artwork: this.coverUrl()
				? [
					{
						src: this.coverUrl(),
						sizes: '512x512',
						type: 'image/jpeg',
					},
				]
				: undefined,
		});

		navigator.mediaSession.playbackState = this.paused() ? 'paused' : 'playing';
		this.updateMediaSessionPosition();
	}

	private updateMediaSessionPosition(): void {
		if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
			return;
		}

		if (typeof navigator.mediaSession.setPositionState !== 'function') {
			return;
		}

		const duration = this.durationSeconds();
		if (!Number.isFinite(duration) || duration <= 0) {
			return;
		}

		try {
			navigator.mediaSession.setPositionState({
				duration,
				playbackRate: this.audio.playbackRate || 1,
				position: Math.max(0, Math.min(this.currentSeconds(), duration)),
			});
		} catch {
			// Some browsers reject transient states.
		}
	}

	private startProgressSaveTicker(): void {
		if (this.progressSaveTimer) {
			return;
		}

		this.progressSaveTimer = setInterval(() => {
			void this.persistProgress();
		}, 15000);
	}

	private stopProgressSaveTicker(): void {
		if (!this.progressSaveTimer) {
			return;
		}

		clearInterval(this.progressSaveTimer);
		this.progressSaveTimer = undefined;
	}

	private async persistProgress(): Promise<void> {
		const book = this.currentBook();
		if (!book) {
			return;
		}

		if (!Number.isFinite(this.audio.duration) || this.audio.duration <= 0) {
			return;
		}

		const idempotencyKey = `${book.id}:${Math.floor(Date.now() / 15000)}`;
		await firstValueFrom(
			this.progress.saveForBook(
				book.id,
				{
					positionSeconds: Math.floor(this.audio.currentTime),
					durationAtSave: Math.floor(this.audio.duration),
				},
				idempotencyKey,
			),
		).catch(() => undefined);
	}

	private flushListeningSession(): void {
		const book = this.currentBook();
		if (!book || !this.sessionStartedAt) {
			return;
		}

		const startedAt = this.sessionStartedAt;
		const startPosition = this.sessionStartPosition;
		const endPosition = this.audio.currentTime;
		const listenedSeconds = Math.max(0, Math.round(endPosition - startPosition));

		this.sessionStartedAt = null;
		this.sessionStartPosition = endPosition;

		if (listenedSeconds < 3) {
			return;
		}

		void firstValueFrom(
			this.stats.createSession(
				{
					bookId: book.id,
					startedAt: startedAt.toISOString(),
					endedAt: new Date().toISOString(),
					listenedSeconds,
					startPositionSeconds: Math.floor(startPosition),
					endPositionSeconds: Math.floor(endPosition),
					device: 'web',
				},
				`${book.id}:session:${startedAt.getTime()}`,
			),
		).catch(() => undefined);
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
