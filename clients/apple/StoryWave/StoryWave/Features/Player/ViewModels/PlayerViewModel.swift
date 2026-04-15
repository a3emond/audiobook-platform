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
    let audioSessionAdapter: AudioSessionAdapter
    let remoteCommandsAdapter: RemoteCommandsAdapter

    // MARK: Device Identity

    let deviceId: String
    let deviceLabel = "Apple App"

    // MARK: Timing Constants

    let presenceBroadcastInterval: UInt64 = 10_000_000_000 // 10s
    let autosaveInterval: UInt64 = 15_000_000_000         // 15s
    let liveProgressDebounceInterval: TimeInterval = 2

    // MARK: Realtime State

    var lastClaimTime: TimeInterval = 0
    var lastLocalTakeoverAt: TimeInterval = 0
    var lastLiveProgressEmitAt: TimeInterval = 0
    var isRealtimeBound = false
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
        audioSessionAdapter: AudioSessionAdapter,
        remoteCommandsAdapter: RemoteCommandsAdapter
    ) {
        self.repository = repository
        self.authService = authService
        self.realtime = realtime
        self.cache = cache
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
            state.chapters = playbackDetails.chapters
            state.currentChapterIndex = chapterIndex(for: authoritativePosition)

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
    }

    // MARK: Deinit

    deinit {
        autosaveTask?.cancel()
        presenceTask?.cancel()

        if let periodicObserver {
            player?.removeTimeObserver(periodicObserver)
        }
        player?.pause()

        remoteCommandsAdapter.removeRemoteCommandTargets()
        remoteCommandsAdapter.clearNowPlayingInfo()
        audioSessionAdapter.cleanup()
        isRealtimeBound = false
        realtime.disconnect()
    }
}
