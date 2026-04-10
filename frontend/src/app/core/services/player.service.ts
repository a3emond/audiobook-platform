import { computed, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

import type { Book, Chapter, ResumeInfo } from '../models/api.models';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { RealtimeService } from './realtime.service';
import {
	configureMediaSessionActions,
	getMediaSession,
	updateMediaSessionMetadata,
	updateMediaSessionPosition,
} from './player-media-session.utils';
import { ProgressService } from './progress.service';
import { StatsService } from './stats.service';
import {
	chapterStartSeconds,
	currentChapterIndex,
	normalizeChapters,
	streamUrlForBook,
} from './player.service.utils';

interface PlaybackSessionPresencePayload {
	userId: string;
	deviceId: string;
	label: string;
	platform: string;
	currentBookId: string | null;
	paused: boolean;
	timestamp: string;
}

interface PlaybackClaimPayload {
	userId: string;
	deviceId: string;
	bookId: string;
	timestamp: string;
}

export interface PlaybackDeviceSession {
	deviceId: string;
	label: string;
	platform: string;
	currentBookId: string | null;
	paused: boolean;
	lastSeenAt: string;
}

@Injectable({ providedIn: 'root' })
// player: keeps UI and state logic readable for this frontend unit.
export class PlayerService {
	readonly currentBook = signal<Book | null>(null);
	readonly chapters = signal<Chapter[]>([]);
	readonly coverUrl = signal('');
	readonly currentSeconds = signal(0);
	readonly durationSeconds = signal(0);
	readonly backwardJumpSeconds = signal(15);
	readonly forwardJumpSeconds = signal(30);
	readonly paused = signal(true);
	readonly metadataLoaded = signal(false);
	readonly error = signal<string | null>(null);
	readonly hasActiveBook = computed(() => Boolean(this.currentBook()));
	readonly playbackDeviceId = signal('');
	readonly listeningDevices = signal<PlaybackDeviceSession[]>([]);
	readonly activeListeningDeviceId = signal<string | null>(null);
	readonly activeListeningDevice = computed<PlaybackDeviceSession | null>(() => {
		const activeId = this.activeListeningDeviceId();
		if (!activeId) {
			return null;
		}

		return this.listeningDevices().find((item) => item.deviceId === activeId) ?? null;
	});
	readonly activeListeningDeviceLabel = computed(() => this.activeListeningDevice()?.label ?? 'another device');
	readonly shouldShowListeningBadge = computed(() => {
		const active = this.activeListeningDevice();
		if (!active) {
			return false;
		}

		if (active.deviceId === this.playbackDeviceId()) {
			return false;
		}

		return !active.paused;
	});

	private readonly audio = new Audio();
	private pendingInitialPosition: number | null = null;
	private progressSaveTimer?: ReturnType<typeof setInterval>;
	private playbackPresenceTimer?: ReturnType<typeof setInterval>;
	private sessionStartedAt: Date | null = null;
	private sessionStartPosition = 0;
	private lastSyncedProgressTime = 0;
	private lastPlayClaimTime = 0;
	private lastLiveProgressEmitAt = 0;
	private suppressLiveProgressUntil = 0;

	constructor(
		private readonly api: ApiService,
		private readonly auth: AuthService,
		private readonly realtime: RealtimeService,
		private readonly progress: ProgressService,
		private readonly stats: StatsService,
	) {
		this.initializePlaybackDevice();
		this.configureAudioEvents();
		this.configureMediaSessionActions();
		this.setupProgressSync();
		this.setupPlaybackSessions();
	}

	getResumeInfo(bookId: string): Observable<ResumeInfo> {
		return this.api.get<ResumeInfo>(`/streaming/books/${bookId}/resume`);
	}

	streamUrl(bookId: string): string {
		return streamUrlForBook(bookId, this.auth.accessToken());
	}

	claimListeningHere(): void {
		this.claimPlaybackOwnership();
	}

	applyProgressSync(syncedData: {
		bookId: string;
		positionSeconds: number;
		durationAtSave: number;
		completed: boolean;
		timestamp: string;
	}): void {
		// Only apply synced progress if:
		// 1. It's for the currently playing book
		// 2. Audio is not currently playing (avoid disruptive sync during playback)
		// 3. The synced timestamp is newer than our last recorded sync time
		const currentBook = this.currentBook();
		if (!currentBook || currentBook.id !== syncedData.bookId) {
			return;
		}

		const syncTime = new Date(syncedData.timestamp).getTime();
		if (syncTime <= this.lastSyncedProgressTime) {
			return;
		}

		// Only update position if not actively playing
		if (!this.paused()) {
			return;
		}

		this.lastSyncedProgressTime = syncTime;
		this.suppressLiveProgressUntil = Date.now() + 1500;
		this.setCurrentTime(syncedData.positionSeconds);
	}

	private setupProgressSync(): void {
		// Listen for progress synced events from other devices/tabs
		this.realtime.on<{
			userId: string;
			bookId: string;
			positionSeconds: number;
			durationAtSave: number;
			completed: boolean;
			timestamp: string;
		}>('progress.synced').subscribe((progressData) => {
			if (progressData.userId !== this.auth.user()?.id) {
				return;
			}
			this.applyProgressSync(progressData);
		});
	}

	private setupPlaybackSessions(): void {
		this.realtime.on<PlaybackSessionPresencePayload>('playback.session.presence').subscribe((presence) => {
			this.applyPlaybackPresence(presence);
		});

		this.realtime.on<PlaybackClaimPayload>('playback.claimed').subscribe((claim) => {
			this.applyPlaybackClaim(claim);
		});

		window.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') {
				this.broadcastPlaybackPresence();
			}
		});

		window.addEventListener('beforeunload', () => {
			this.broadcastPlaybackPresence();
		});

		this.startPlaybackPresenceTicker();
		this.broadcastPlaybackPresence();
	}

	loadBook(book: Book, options?: { startSeconds?: number; coverUrl?: string; forceReload?: boolean }): void {
		const current = this.currentBook();
		const sameBook = current?.id === book.id;
		const shouldReload = options?.forceReload || !sameBook;
		const normalizedBookChapters = normalizeChapters(book.chapters ?? [], Math.max(0, Math.floor(book.duration || 0)));

		this.currentBook.set(book);
		this.chapters.set(normalizedBookChapters);
		this.coverUrl.set(options?.coverUrl ?? this.coverUrl());
		this.error.set(null);

		if (!shouldReload) {
			if (typeof options?.startSeconds === 'number' && !this.metadataLoaded()) {
				this.pendingInitialPosition = Math.max(0, options.startSeconds);
			}
			this.updateMediaSessionMetadata();
			this.broadcastPlaybackPresence();
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
		this.broadcastPlaybackPresence();
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

	setJumpSeconds(backward: number, forward: number): void {
		this.backwardJumpSeconds.set(Math.max(1, Math.floor(backward)));
		this.forwardJumpSeconds.set(Math.max(1, Math.floor(forward)));
	}

	setPlaybackRate(rate: number): void {
		const clamped = Math.max(0.5, Math.min(3, rate || 1));
		this.audio.playbackRate = clamped;
		this.updateMediaSessionPosition();
	}

	setCurrentTime(seconds: number): void {
		const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : Number.POSITIVE_INFINITY;
		const clamped = Math.max(0, Math.min(seconds, duration));
		this.audio.currentTime = clamped;
		this.currentSeconds.set(Math.floor(clamped));
		this.updateMediaSessionPosition();
		this.broadcastLiveProgressSync(true);
	}

	jumpToChapter(index: number): void {
		const chapters = this.chapters();
		const chapter = chapters[index];
		if (!chapter) {
			return;
		}

		this.setCurrentTime(chapterStartSeconds(chapter));
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

		const currentStart = chapterStartSeconds(chapters[index]);
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
		return currentChapterIndex(this.chapters(), this.currentSeconds());
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
			this.broadcastLiveProgressSync(false);
		});

		this.audio.addEventListener('play', () => {
			this.paused.set(false);
			this.claimPlaybackOwnership();
			if (!this.sessionStartedAt) {
				this.sessionStartedAt = new Date();
				this.sessionStartPosition = this.audio.currentTime;
			}
			this.startProgressSaveTicker();
			this.updateMediaSessionMetadata();
			this.broadcastPlaybackPresence();
		});

		this.audio.addEventListener('pause', () => {
			this.paused.set(true);
			this.flushListeningSession();
			this.stopProgressSaveTicker();
			void this.persistProgress();
			this.updateMediaSessionMetadata();
			this.broadcastPlaybackPresence();
			this.broadcastLiveProgressSync(true);
		});

		this.audio.addEventListener('ended', () => {
			this.paused.set(true);
			this.flushListeningSession();
			this.stopProgressSaveTicker();
			void this.persistProgress();
			this.updateMediaSessionMetadata();
			this.broadcastPlaybackPresence();
		});

		this.audio.addEventListener('error', () => {
			this.error.set('Unable to play this audio stream right now.');
		});
	}

	private configureMediaSessionActions(): void {
		configureMediaSessionActions(getMediaSession(), {
			onPlay: () => this.play(),
			onPause: () => this.pause(),
			onSeekBackward: (offset) => this.seek(-(offset ?? this.backwardJumpSeconds())),
			onSeekForward: (offset) => this.seek(offset ?? this.forwardJumpSeconds()),
			onSeekTo: (time) => this.setCurrentTime(time),
			onPreviousTrack: () => this.seek(-this.backwardJumpSeconds()),
			onNextTrack: () => this.seek(this.forwardJumpSeconds()),
		});
	}

	private updateMediaSessionMetadata(): void {
		updateMediaSessionMetadata(getMediaSession(), this.currentBook(), this.coverUrl(), this.paused());
		this.updateMediaSessionPosition();
	}

	private updateMediaSessionPosition(): void {
		updateMediaSessionPosition(
			getMediaSession(),
			this.durationSeconds(),
			this.currentSeconds(),
			this.audio.playbackRate || 1,
		);
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

	private initializePlaybackDevice(): void {
		const storageKey = 'player.webDeviceId';
		let deviceId = localStorage.getItem(storageKey);
		if (!deviceId) {
			deviceId = typeof crypto !== 'undefined' && crypto.randomUUID
				? crypto.randomUUID()
				: `web-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
			localStorage.setItem(storageKey, deviceId);
		}

		this.playbackDeviceId.set(deviceId);
		this.activeListeningDeviceId.set(deviceId);
	}

	private startPlaybackPresenceTicker(): void {
		if (this.playbackPresenceTimer) {
			return;
		}

		this.playbackPresenceTimer = setInterval(() => {
			this.pruneStalePlaybackDevices();
			this.broadcastPlaybackPresence();
		}, 10000);
	}

	private broadcastPlaybackPresence(): void {
		const user = this.auth.user();
		const deviceId = this.playbackDeviceId();
		if (!user?.id || !deviceId) {
			return;
		}

		const payload = {
			userId: user.id,
			deviceId,
			label: this.browserLabel(),
			platform: 'web',
			currentBookId: this.currentBook()?.id ?? null,
			paused: this.paused(),
		};

		this.realtime.send('playback.session.presence', payload);

		this.applyPlaybackPresence({
			...payload,
			timestamp: new Date().toISOString(),
		});
	}

	private applyPlaybackPresence(presence: PlaybackSessionPresencePayload): void {
		const user = this.auth.user();
		if (!user || presence.userId !== user.id) {
			return;
		}

		const nextById = new Map(this.listeningDevices().map((item) => [item.deviceId, item]));
		nextById.set(presence.deviceId, {
			deviceId: presence.deviceId,
			label: presence.label,
			platform: presence.platform,
			currentBookId: presence.currentBookId,
			paused: presence.paused,
			lastSeenAt: presence.timestamp,
		});

		const ownDeviceId = this.playbackDeviceId();
		const sorted = Array.from(nextById.values())
			.filter((item) => Date.now() - new Date(item.lastSeenAt).getTime() <= 35000)
			.sort((a, b) => {
				if (a.deviceId === ownDeviceId) {
					return -1;
				}
				if (b.deviceId === ownDeviceId) {
					return 1;
				}
				return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
			});

		this.listeningDevices.set(sorted);
	}

	private pruneStalePlaybackDevices(): void {
		const current = this.listeningDevices();
		const filtered = current.filter((item) => Date.now() - new Date(item.lastSeenAt).getTime() <= 35000);
		if (filtered.length !== current.length) {
			this.listeningDevices.set(filtered);
		}
	}

	private claimPlaybackOwnership(): void {
		const user = this.auth.user();
		const book = this.currentBook();
		const deviceId = this.playbackDeviceId();
		if (!user?.id || !book?.id || !deviceId) {
			return;
		}

		const timestamp = new Date().toISOString();
		this.lastPlayClaimTime = new Date(timestamp).getTime();
		this.activeListeningDeviceId.set(deviceId);

		this.realtime.send('playback.claim', {
			userId: user.id,
			deviceId,
			bookId: book.id,
			timestamp,
		});
	}

	private broadcastLiveProgressSync(force: boolean): void {
		const now = Date.now();
		if (now < this.suppressLiveProgressUntil) {
			return;
		}

		if (!force && now - this.lastLiveProgressEmitAt < 2000) {
			return;
		}

		const user = this.auth.user();
		const book = this.currentBook();
		if (!user?.id || !book?.id) {
			return;
		}

		const duration = Number.isFinite(this.audio.duration) && this.audio.duration > 0
			? Math.floor(this.audio.duration)
			: this.durationSeconds();
		if (!Number.isFinite(duration) || duration <= 0) {
			return;
		}

		const position = Math.max(0, Math.floor(this.audio.currentTime));
		const completed = position >= Math.max(0, duration - 1);
		this.lastLiveProgressEmitAt = now;

		this.realtime.send('playback.progress', {
			userId: user.id,
			bookId: book.id,
			positionSeconds: position,
			durationAtSave: duration,
			completed,
			timestamp: new Date(now).toISOString(),
		});
	}

	private applyPlaybackClaim(claim: PlaybackClaimPayload): void {
		const user = this.auth.user();
		const ownDeviceId = this.playbackDeviceId();
		if (!user || !ownDeviceId || claim.userId !== user.id) {
			return;
		}

		const claimTime = new Date(claim.timestamp).getTime();
		if (!Number.isFinite(claimTime) || claimTime < this.lastPlayClaimTime) {
			return;
		}

		this.lastPlayClaimTime = claimTime;
		this.activeListeningDeviceId.set(claim.deviceId);

		if (claim.deviceId !== ownDeviceId && !this.paused()) {
			this.pause();
		}
	}

	private browserLabel(): string {
		const ua = navigator.userAgent;
		const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
		const platform = navigator.platform || '';
		const isIOSDevice = /iPhone|iPad|iPod/i.test(ua);
		const isIPadDesktopMode = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
		const browser = ua.includes('Firefox')
			? 'Firefox'
			: ua.includes('Edg/')
				? 'Edge'
				: ua.includes('Chrome')
					? 'Chrome'
					: ua.includes('Safari')
						? 'Safari'
						: 'Browser';

		const uaPlatform = nav.userAgentData?.platform;
		const os = isIOSDevice || isIPadDesktopMode || /iPhone|iPad|iPod/i.test(uaPlatform ?? '')
			? 'iOS'
			: uaPlatform
				? uaPlatform
				: ua.includes('Android')
					? 'Android'
					: ua.includes('Windows') || /Win32|Win64/i.test(platform)
						? 'Windows'
						: ua.includes('Mac OS X') || /Mac/i.test(platform)
							? 'macOS'
							: ua.includes('Linux') || /Linux/i.test(platform)
								? 'Linux'
								: 'Web';

		return `${browser} on ${os}`;
	}

}
