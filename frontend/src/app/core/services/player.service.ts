/**
 * ============================================================
 * player.service.ts
 * ============================================================
 *
 * Core audio playback service. Owns the browser Audio element,
 * progress persistence, MediaSession integration, and cross-device
 * presence / session tracking via WebSocket.
 *
 * Exported:
 *   PlayerService           — root-level injectable
 *   PlaybackDeviceSession   — session entry in the presence list (re-exported)
 *
 * Signals (reactive state):
 *   currentBook             — currently loaded Book or null
 *   chapters                — normalized Chapter[] for currentBook
 *   coverUrl                — authenticated cover image URL
 *   currentSeconds          — current playback position (whole seconds)
 *   durationSeconds         — total audio duration (whole seconds)
 *   backwardJumpSeconds     — backward seek offset (default 15 s)
 *   forwardJumpSeconds      — forward seek offset (default 30 s)
 *   paused                  — true when audio is paused / not yet started
 *   metadataLoaded          — true after HTMLAudioElement loadedmetadata fires
 *   error                   — last playback error message or null
 *   playbackDeviceId        — stable per-browser device id (localStorage)
 *   listeningDevices        — presence list of all active sessions for the user
 *   activeListeningDeviceId — id of the device currently owning playback
 *   remoteBook              — Book loaded on the active remote device
 *   remoteBookId            — id of the remote book
 *
 * Computed signals:
 *   hasActiveBook               — whether a book is loaded locally
 *   activeListeningDevice       — full PlaybackDeviceSession for activeListeningDeviceId
 *   activeListeningDeviceLabel  — display label for the active device
 *   isRemotePlaybackActive      — true when a different device is playing
 *   shouldShowListeningBadge    — whether to show the "listening on" badge
 *   topbarBookId                — book id to display in the mini-player topbar
 *   topbarBook                  — Book object for the topbar
 *   topbarTitle                 — title string for the topbar
 *   topbarCoverUrl              — cover URL for the topbar
 *   topbarFallbackInitials      — two-letter initials when cover image is absent
 *   shouldShowTopbarPlayer      — controls topbar visibility
 *   canControlTopbarPlayback    — whether local controls affect the topbar book
 *
 * Public methods:
 *   getResumeInfo(bookId)        — Observable<ResumeInfo>: fetch resume point
 *   streamUrl(bookId)            — string: build authenticated stream URL
 *   claimListeningHere()         — claim playback ownership on this device
 *   applyProgressSync(data)      — apply an incoming progress.synced event
 *   loadBook(book, options?)     — load a book and optionally seek to a position
 *   setInitialPosition(seconds)  — queue a seek before loadedmetadata fires
 *   togglePlay()                 — toggle between play and pause
 *   play() / pause()             — direct playback control
 *   seek(deltaSeconds)           — seek relative to current position
 *   setJumpSeconds(bwd, fwd)     — configure skip-back / skip-forward offsets
 *   setPlaybackRate(rate)        — set playback speed (clamped 0.5–3)
 *   setCurrentTime(seconds)      — seek to an absolute position in seconds
 *   jumpToChapter(index)         — seek to the start of a chapter by index
 *   jumpToPreviousChapter()      — smart previous-chapter with 3-second threshold
 *   jumpToNextChapter()          — advance to the start of the next chapter
 *   currentChapterIndex()        — return index of currently playing chapter
 *   persistNow()                 — force an immediate progress save to the API
 * ============================================================
 */
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
import { LibraryService } from './library.service';
import {
  chapterStartSeconds,
  currentChapterIndex,
  normalizeChapters,
  streamUrlForBook,
} from './player.service.utils';
import type {
  PlaybackClaimPayload,
  PlaybackDeviceSession,
  PlaybackSessionPresencePayload,
} from './player.service.types';

export type { PlaybackDeviceSession };

/**
 * PlayerService owns browser audio playback, progress persistence, and the
 * cross-device session hints used by the player page and topbar mini-player.
 */
@Injectable({ providedIn: 'root' })
export class PlayerService {
  // ─── Reactive playback state ─────────────────────────────────────────────
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

  // ─── Multi-device / remote session state ────────────────────────────────────
  // Device/session state is kept separate from audio state so remote playback
  // can be represented without taking over the local audio element.
  readonly playbackDeviceId = signal('');
  readonly listeningDevices = signal<PlaybackDeviceSession[]>([]);
  readonly activeListeningDeviceId = signal<string | null>(null);
  readonly remoteBook = signal<Book | null>(null);
  readonly remoteBookId = signal<string | null>(null);
  readonly activeListeningDevice = computed<PlaybackDeviceSession | null>(() => {
    const activeId = this.activeListeningDeviceId();
    if (!activeId) {
      return null;
    }

    return this.listeningDevices().find((item) => item.deviceId === activeId) ?? null;
  });
  readonly activeListeningDeviceLabel = computed(
    () => this.activeListeningDevice()?.label ?? 'another device',
  );
  readonly isRemotePlaybackActive = computed(() => {
    const active = this.activeListeningDevice();
    if (!active) {
      return false;
    }

    if (active.deviceId === this.playbackDeviceId()) {
      return false;
    }

    return !active.paused;
  });
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

  // ─── Computed: topbar mini-player state ──────────────────────────────────────
  readonly topbarBookId = computed<string | null>(() => {
    if (this.isRemotePlaybackActive()) {
      return this.activeListeningDevice()?.currentBookId ?? this.remoteBookId();
    }

    return this.currentBook()?.id ?? null;
  });
  readonly topbarBook = computed<Book | null>(() => {
    const localBook = this.currentBook();
    if (!this.isRemotePlaybackActive()) {
      return localBook;
    }

    const remoteBookId = this.topbarBookId();
    if (localBook && remoteBookId && localBook.id === remoteBookId) {
      return localBook;
    }

    return this.remoteBook();
  });
  readonly topbarTitle = computed(() => this.topbarBook()?.title ?? 'Live playback');
  readonly topbarCoverUrl = computed(() => {
    const localBook = this.currentBook();
    const topbarBookId = this.topbarBookId();
    if (localBook && topbarBookId && localBook.id === topbarBookId) {
      return this.coverUrl();
    }

    const remoteBook = this.remoteBook();
    if (!remoteBook) {
      return '';
    }

    return this.coverUrlForBook(remoteBook);
  });
  readonly topbarFallbackInitials = computed(() => {
    const initials = this.topbarTitle()
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');

    return initials || 'ON';
  });
  readonly shouldShowTopbarPlayer = computed(
    () => Boolean(this.currentBook()) || this.isRemotePlaybackActive(),
  );
  readonly canControlTopbarPlayback = computed(() => {
    if (this.isRemotePlaybackActive()) {
      return false;
    }

    const current = this.currentBook();
    const topbarBookId = this.topbarBookId();
    return Boolean(current && topbarBookId && current.id === topbarBookId);
  });

  // ─── Private implementation fields ───────────────────────────────────────────
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
  private lastPresenceReplyAt = 0;
  private remoteBookFetchRequestId = 0;

  // ─── Constructor ─────────────────────────────────────────────────────────────
  // Wires browser integrations once; from there signals drive UI updates.
  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly realtime: RealtimeService,
    private readonly progress: ProgressService,
    private readonly stats: StatsService,
    private readonly library: LibraryService,
  ) {
    this.initializePlaybackDevice();
    this.configureAudioEvents();
    this.configureMediaSessionActions();
    this.setupProgressSync();
    this.setupPlaybackSessions();
  }

  // ─── Public API ──────────────────────────────────────────────────────────────
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
    // Remote progress is only safe to apply when it refers to the same book and
    // local playback is idle; otherwise the user would feel the player jump.
    const currentBook = this.currentBook();
    if (!currentBook || currentBook.id !== syncedData.bookId) {
      return;
    }

    const syncTime = new Date(syncedData.timestamp).getTime();
    if (syncTime <= this.lastSyncedProgressTime) {
      return;
    }

    if (!this.paused()) {
      return;
    }

    this.lastSyncedProgressTime = syncTime;
    this.suppressLiveProgressUntil = Date.now() + 1500;
    this.setCurrentTime(syncedData.positionSeconds);
  }

  // Loading a book updates UI state immediately, then decides whether the audio
  // element must actually be reloaded or can continue with the current source.
  loadBook(
    book: Book,
    options?: { startSeconds?: number; coverUrl?: string; forceReload?: boolean },
  ): void {
    const current = this.currentBook();
    const sameBook = current?.id === book.id;
    const shouldReload = options?.forceReload || !sameBook;
    const normalizedBookChapters = normalizeChapters(
      book.chapters ?? [],
      Math.max(0, Math.floor(book.duration || 0)),
    );

    this.currentBook.set(book);
    this.chapters.set(normalizedBookChapters);
    this.coverUrl.set(options?.coverUrl ?? this.coverUrl());
    this.error.set(null);

    if (!shouldReload) {
      // Keep UI transport state aligned with the actual audio element.
      this.paused.set(this.audio.paused);
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
    this.paused.set(true);

    this.metadataLoaded.set(false);
    this.pendingInitialPosition = Math.max(0, options?.startSeconds ?? 0);
    this.durationSeconds.set(Math.max(0, Math.floor(book.duration || 0)));
    this.currentSeconds.set(Math.floor(this.pendingInitialPosition));

    this.audio.src = this.streamUrl(book.id);
    this.audio.load();
    this.paused.set(true);
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
      this.paused.set(true);
      this.error.set('Playback was blocked by the browser. Interact with the page and try again.');
    });
  }

  pause(): void {
    this.paused.set(true);
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
    const duration = Number.isFinite(this.audio.duration)
      ? this.audio.duration
      : Number.POSITIVE_INFINITY;
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

  // ─── Private: Audio element event wiring ────────────────────────────────
  // Browser audio events are the source of truth for paused/playing state.
  private configureAudioEvents(): void {
    this.audio.addEventListener('loadedmetadata', () => {
      this.metadataLoaded.set(true);
      this.paused.set(this.audio.paused);
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

  // ─── Private: MediaSession integration ───────────────────────────────────────
  // MediaSession keeps lock-screen / headset controls wired to the same public API.
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
    updateMediaSessionMetadata(
      getMediaSession(),
      this.currentBook(),
      this.coverUrl(),
      this.paused(),
    );
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

  // ─── Private: Realtime subscriptions ──────────────────────────────────────────
  // Realtime progress sync keeps idle tabs/devices aligned with the active listener.
  private setupProgressSync(): void {
    this.realtime
      .on<{
        userId: string;
        bookId: string;
        positionSeconds: number;
        durationAtSave: number;
        completed: boolean;
        timestamp: string;
      }>('progress.synced')
      .subscribe((progressData) => {
        if (progressData.userId !== this.auth.user()?.id) {
          return;
        }
        this.applyProgressSync(progressData);
      });
  }

  // Presence and claim events are intentionally handled separately:
  // presence answers "who is around" while claim answers "who owns playback now".
  private setupPlaybackSessions(): void {
    this.realtime
      .on<PlaybackSessionPresencePayload>('playback.session.presence')
      .subscribe((presence) => {
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

  // ─── Private: Progress persistence ───────────────────────────────────────────
  // Progress persistence is intentionally coarse-grained to limit API noise.
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

  // The idempotency key buckets writes in 15-second windows so retries stay safe.
  private async persistProgress(): Promise<void> {
    const book = this.currentBook();
    if (!book) {
      return;
    }

    if (!Number.isFinite(this.audio.duration) || this.audio.duration <= 0) {
      return;
    }

    // Key includes the floored position so two saves at different positions
    // within the same 15-second window are never treated as conflicting retries
    // of the same request (e.g. auto-save ticker fires, then pause fires seconds later).
    const pos = Math.floor(this.audio.currentTime);
    const idempotencyKey = `${book.id}:${pos}:${Math.floor(Date.now() / 15000)}`;
    await firstValueFrom(
      this.progress.saveForBook(
        book.id,
        {
          positionSeconds: pos,
          durationAtSave: Math.floor(this.audio.duration),
        },
        idempotencyKey,
      ),
    ).catch(() => undefined);
  }

  // ─── Private: Listening session analytics ───────────────────────────────────
  // Listening sessions are analytics-oriented and ignore accidental taps or very short bursts.
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

  // ─── Private: Multi-device presence & session management ───────────────────
  // Each browser tab gets its own device id via sessionStorage so multi-tab
  // sessions are treated as separate devices for presence and mini-player sync.
  // sessionStorage persists across page reloads within the same tab but is
  // isolated between tabs, unlike localStorage which would make all tabs share
  // one id and collapse into a single presence entry (hiding the mini-player).
  private initializePlaybackDevice(): void {
    const storageKey = 'player.webDeviceId';
    let deviceId = sessionStorage.getItem(storageKey);
    if (!deviceId) {
      deviceId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `web-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      sessionStorage.setItem(storageKey, deviceId);
    }

    this.playbackDeviceId.set(deviceId);
    this.activeListeningDeviceId.set(deviceId);
  }

  // Presence is periodic because websocket clients can disappear without a clean close event.
  private startPlaybackPresenceTicker(): void {
    if (this.playbackPresenceTimer) {
      return;
    }

    this.playbackPresenceTimer = setInterval(() => {
      this.pruneStalePlaybackDevices();
      this.broadcastPlaybackPresence();
    }, 10000);
  }

  // Applying local presence immediately keeps local UI responsive before the websocket round-trip returns.
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

  // Presence updates rebuild the device list and also promote the best candidate
  // for "active listener" so passive devices can still render remote playback.
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

    const nextActive = this.resolveActiveListeningDevice(sorted, presence.deviceId);
    this.activeListeningDeviceId.set(nextActive?.deviceId ?? ownDeviceId ?? null);
    this.refreshRemoteBookContext();

    // Fast handshake: when a new device announces itself, reply quickly so it
    // can discover active playback without waiting for the 10s presence ticker.
    if (presence.deviceId !== ownDeviceId) {
      this.replyToPresenceProbe();
    }
  }

  // Stale devices are pruned aggressively to avoid showing ghost listeners.
  private pruneStalePlaybackDevices(): void {
    const current = this.listeningDevices();
    const filtered = current.filter(
      (item) => Date.now() - new Date(item.lastSeenAt).getTime() <= 35000,
    );
    if (filtered.length !== current.length) {
      this.listeningDevices.set(filtered);
      const nextActive = this.resolveActiveListeningDevice(filtered);
      this.activeListeningDeviceId.set(nextActive?.deviceId ?? this.playbackDeviceId() ?? null);
      this.refreshRemoteBookContext();
    }
  }

  private replyToPresenceProbe(): void {
    const now = Date.now();
    if (now - this.lastPresenceReplyAt < 1500) {
      return;
    }

    this.lastPresenceReplyAt = now;
    this.broadcastPlaybackPresence();
  }

  // A claim declares playback ownership and is the event other active devices use to yield control.
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

  // Live progress updates are more frequent than persisted progress, so they are throttled
  // and temporarily muted after applying an incoming sync.
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

    const duration =
      Number.isFinite(this.audio.duration) && this.audio.duration > 0
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

  // When another device claims playback, the local player yields instead of competing for transport control.
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
    this.refreshRemoteBookContext(claim.bookId);

    if (claim.deviceId !== ownDeviceId && !this.paused()) {
      this.pause();
    }
  }

  // The resolution strategy favors a currently playing device, then the newest
  // reported player, then finally the local device as a stable fallback.
  private resolveActiveListeningDevice(
    devices: PlaybackDeviceSession[],
    preferredDeviceId?: string,
  ): PlaybackDeviceSession | null {
    if (devices.length === 0) {
      return null;
    }

    const currentActiveId = this.activeListeningDeviceId();
    const currentActive = currentActiveId
      ? devices.find((item) => item.deviceId === currentActiveId)
      : undefined;
    if (currentActive && !currentActive.paused) {
      return currentActive;
    }

    const playingDevices = devices.filter((item) => !item.paused);
    if (playingDevices.length > 0) {
      if (preferredDeviceId) {
        const preferred = playingDevices.find((item) => item.deviceId === preferredDeviceId);
        if (preferred) {
          return preferred;
        }
      }

      return playingDevices[0] ?? null;
    }

    const ownDeviceId = this.playbackDeviceId();
    if (ownDeviceId) {
      const ownDevice = devices.find((item) => item.deviceId === ownDeviceId);
      if (ownDevice) {
        return ownDevice;
      }
    }

    return devices[0] ?? null;
  }

  // ─── Private: Remote book context ────────────────────────────────────────
  // Remote book context is derived from the active remote device and fetched lazily
  // so the topbar can show metadata without mutating local playback state.
  private refreshRemoteBookContext(bookIdFromClaim?: string): void {
    const active = this.activeListeningDevice();
    const ownDeviceId = this.playbackDeviceId();
    if (!active || active.deviceId === ownDeviceId || active.paused) {
      this.remoteBookId.set(null);
      this.remoteBook.set(null);
      return;
    }

    const bookId = bookIdFromClaim ?? active.currentBookId ?? null;
    this.remoteBookId.set(bookId);
    if (!bookId) {
      this.remoteBook.set(null);
      return;
    }

    const localBook = this.currentBook();
    if (localBook && localBook.id === bookId) {
      this.remoteBook.set(localBook);
      return;
    }

    if (this.remoteBook()?.id === bookId) {
      return;
    }

    this.remoteBook.set(null);
    void this.fetchRemoteBook(bookId);
  }

  // Request ids guard against older book fetches winning races after a fast device switch.
  private async fetchRemoteBook(bookId: string): Promise<void> {
    const requestId = ++this.remoteBookFetchRequestId;

    try {
      const book = await firstValueFrom(this.library.getBook(bookId));
      if (requestId !== this.remoteBookFetchRequestId || this.remoteBookId() !== bookId) {
        return;
      }

      this.remoteBook.set(book);
    } catch {
      // Leave the topbar in badge-only mode if metadata fetch fails.
    }
  }

  // ─── Private: Helpers ─────────────────────────────────────────────────────
  private coverUrlForBook(book: Book): string {
    const token = this.auth.accessToken();
    if (!book.coverPath || !token) {
      return '';
    }

    return `/streaming/books/${book.id}/cover?access_token=${encodeURIComponent(token)}`;
  }

  // Labels are only for presence display, so the heuristic aims for readable rather than perfect detection.
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
    const os =
      isIOSDevice || isIPadDesktopMode || /iPhone|iPad|iPod/i.test(uaPlatform ?? '')
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
