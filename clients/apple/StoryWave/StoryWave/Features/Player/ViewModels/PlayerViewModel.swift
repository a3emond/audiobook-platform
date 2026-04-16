import Foundation
import Combine
import AudiobookCore
import AVFoundation
import MediaPlayer

// MARK: - PlayerViewModel

@MainActor
final class PlayerViewModel: ObservableObject {

    // MARK: Published State

    @Published var state = PlayerViewState()

    // MARK: Dependencies

    let repository: PlayerRepository
    let authService: AuthService
    let realtime: RealtimeClient
    let cache: PlayerPlaybackCache
    let appCacheService: AppCacheService
    let audioSessionAdapter: AudioSessionAdapter
    let remoteCommandsAdapter: RemoteCommandsAdapter

    // MARK: Device Identity

    let deviceId: String
    let deviceLabel = "Apple App"

    // MARK: Timing Constants

    let presenceBroadcastInterval: UInt64 = 5_000_000_000  // 5s
    let autosaveInterval: UInt64 = 15_000_000_000         // 15s
    let liveProgressDebounceInterval: TimeInterval = 2

    // MARK: Realtime State

    var lastClaimTime: TimeInterval = 0
    var lastLocalTakeoverAt: TimeInterval = 0
    var lastLiveProgressEmitAt: TimeInterval = 0
    var isRealtimeBound = false
    var realtimeSubscriptionID: UUID?
    var presenceTask: Task<Void, Never>?
    var presenceByDeviceId: [String: PlaybackPresence] = [:]
    var remoteBookFetchRequestId = 0

    // MARK: AVPlayer State

    var player: AVPlayer?
    var periodicObserver: Any?

    // MARK: Autosave

    var autosaveTask: Task<Void, Never>?

    // MARK: Sleep Timer State

    var sleepTimerTask: Task<Void, Never>?
    var sleepRemainingMs: Int?
    var sleepStartedAt: Date?
    var sleepPausedAt: Date?
    var chapterSleepTargetSeconds: Double?

    let sleepPauseResetSeconds: TimeInterval = 30
    let sleepModeMinutes: [PlayerSleepTimerMode: Int] = [
        .fifteenMinutes: 15,
        .thirtyMinutes: 30,
        .fortyFiveMinutes: 45,
        .sixtyMinutes: 60,
    ]

    // MARK: Init

    init(
        repository: PlayerRepository,
        authService: AuthService,
        realtime: RealtimeClient,
        cache: PlayerPlaybackCache,
        appCacheService: AppCacheService,
        audioSessionAdapter: AudioSessionAdapter,
        remoteCommandsAdapter: RemoteCommandsAdapter
    ) {
        self.repository = repository
        self.authService = authService
        self.realtime = realtime
        self.cache = cache
        self.appCacheService = appCacheService
        self.audioSessionAdapter = audioSessionAdapter
        self.remoteCommandsAdapter = remoteCommandsAdapter

        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: "player_apple_device_id") {
            self.deviceId = existing
        } else {
            let generated = UUID().uuidString
            defaults.set(generated, forKey: "player_apple_device_id")
            self.deviceId = generated
        }

        // Bind realtime at shell startup so cross-device playback can appear
        // even before the local player screen is opened.
        bindRealtimeIfNeeded()
    }

    // MARK: Load

    func load(bookId: String, title: String) async {
        guard !Task.isCancelled else { return }

        bindRealtimeIfNeeded()
        state.isLoading = true
        state.errorMessage = nil
        state.bookId = bookId
        state.title = title

        // New book load => reset remote commands and reconfigure them for the new media item.
        remoteCommandsAdapter.removeRemoteCommandTargets()

        do {
            guard !Task.isCancelled else { return }

            async let settingsTask = cache.fetchSettings(using: repository)
            async let playbackTask = cache.fetchPlaybackDetails(bookId: bookId, using: repository)

            let resume = try await repository.resumeInfo(bookId: bookId)
            let dbProgress = try? await repository.fetchProgressLegacy(bookId: bookId)
            let settings = try await settingsTask
            let playbackDetails = try await playbackTask
            let chapterMaxRaw = playbackDetails.chapters.map(\.end).max()

            let normalizedResumeStart = normalizedServerSeconds(resume.startSeconds, chapterMaxRaw: chapterMaxRaw)
            let normalizedResumeDuration = normalizedServerSeconds(resume.durationSeconds, chapterMaxRaw: chapterMaxRaw)
            let normalizedProgressPosition = dbProgress?.positionSeconds.map {
                normalizedServerSeconds(Double($0), chapterMaxRaw: chapterMaxRaw)
            }
            let normalizedProgressDuration = dbProgress?.durationAtSave.map {
                normalizedServerSeconds(Double($0), chapterMaxRaw: chapterMaxRaw)
            }

            let authoritativePosition = normalizedProgressPosition ?? normalizedResumeStart
            let authoritativeDuration = normalizedProgressDuration ?? normalizedResumeDuration
            let playerSettings = settings.player

            state.streamPath = resume.streamPath
            state.streamURLString = authenticatedMediaURLString(for: resume.streamPath)
            state.startSeconds = normalizedResumeStart
            state.positionSeconds = authoritativePosition
            state.durationSeconds = max(0, authoritativeDuration)
            state.author = playbackDetails.author
            state.coverPath = playbackDetails.coverPath
            state.coverURLString = authenticatedMediaURLString(for: "streaming/books/\(bookId)/cover")
            state.backwardJumpSeconds = Double(playerSettings.backwardJumpSeconds ?? 10)
            state.forwardJumpSeconds  = Double(playerSettings.forwardJumpSeconds ?? 30)
            state.playbackRate        = playerSettings.playbackRate ?? 1.0
            state.sleepTimerMode = PlayerSleepTimerMode(rawValue: playerSettings.sleepTimerMode ?? "off") ?? .off
            state.progressMode = .chapter
            state.appliedRewind = resume.appliedRewind
            state.isCompleted = dbProgress?.completed ?? false
            state.chapters = playbackDetails.chapters
            state.currentChapterIndex = chapterIndex(for: authoritativePosition)
            state.series = playbackDetails.series
            state.seriesIndex = playbackDetails.seriesIndex
            state.genre = playbackDetails.genre
            state.tags = playbackDetails.tags
            state.descriptionText = playbackDetails.description?.text(for: LocalizationService.shared.locale)

            // Duration on playback endpoints can vary by source; prefer metadata when present.
            if let metadataDuration = playbackDetails.durationSeconds, metadataDuration > 0 {
                state.durationSeconds = max(0, metadataDuration)
            }

            // Keep completion state consistent with actual playback position to prevent
            // stale completed flags from hiding player overlay actions for a single book.
            let serverCompleted = dbProgress?.completed ?? false
            let completionDuration = max(0, state.durationSeconds)
            let completionPosition = max(0, authoritativePosition)
            let progressDerivedCompleted: Bool
            if completionDuration > 0 {
                let threshold = max(1, completionDuration * 0.995)
                progressDerivedCompleted = completionPosition >= threshold
            } else {
                progressDerivedCompleted = false
            }

            if serverCompleted != progressDerivedCompleted {
                print(
                    "[ProgressDebug][Player][completionMismatch] " +
                    "bookId=\(bookId) " +
                    "serverCompleted=\(serverCompleted) " +
                    "derivedCompleted=\(progressDerivedCompleted) " +
                    "position=\(Int(completionPosition.rounded())) " +
                    "duration=\(Int(completionDuration.rounded()))"
                )
            }
            state.isCompleted = progressDerivedCompleted || (serverCompleted && completionDuration <= 0)

            resetSleepTimerForMode()
            configurePlayerIfNeeded()
            seekPlayer(to: authoritativePosition)
            remoteCommandsAdapter.configureRemoteCommandsIfNeeded()
            updateNowPlayingInfo()
            broadcastPresence()

        } catch {
            state.errorMessage = "Could not load playback data."
        }

        state.isLoading = false
    }

    // MARK: Reset

    func reset() {
        player?.pause()
        state.isPlaying = false
        broadcastPresence()
        stopAutosaveLoop()
        presenceTask?.cancel()
        presenceTask = nil

        sleepTimerTask?.cancel()
        sleepTimerTask = nil
        sleepRemainingMs = nil
        sleepStartedAt = nil
        sleepPausedAt = nil
        chapterSleepTargetSeconds = nil

        remoteCommandsAdapter.removeRemoteCommandTargets()
        clearNowPlayingInfo()
        state = PlayerViewState()

        // Restart the presence heartbeat so remote-device detection continues
        // working even after the player is closed (no local book loaded).
        startPresenceLoop()
    }

    // MARK: Deinit

    deinit {
        autosaveTask?.cancel()
        presenceTask?.cancel()

        let observer = periodicObserver
        let playerRef = player
        let remoteCommandsAdapterRef = remoteCommandsAdapter
        let audioSessionAdapterRef = audioSessionAdapter
        let realtimeRef = realtime
        let subscriptionID = realtimeSubscriptionID

        Task { @MainActor in
            if let observer {
                playerRef?.removeTimeObserver(observer)
            }
            playerRef?.pause()

            remoteCommandsAdapterRef.removeRemoteCommandTargets()
            remoteCommandsAdapterRef.clearNowPlayingInfo()
            audioSessionAdapterRef.cleanup()
            if let subscriptionID {
                realtimeRef.unsubscribe(subscriptionID)
            }
        }
    }
}
