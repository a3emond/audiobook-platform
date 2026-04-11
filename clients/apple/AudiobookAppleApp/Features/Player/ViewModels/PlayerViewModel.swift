import Foundation
import AudiobookCore
import AVFoundation
import MediaPlayer
#if canImport(UIKit)
import UIKit
private typealias PlatformImage = UIImage
#elseif canImport(AppKit)
import AppKit
private typealias PlatformImage = NSImage
#endif

@MainActor
final class PlayerViewModel: ObservableObject {
    @Published private(set) var state = PlayerViewState()

    private let repository: PlayerRepository
    private let authService: AuthService
    private let realtime: RealtimeClient
    private let deviceId: String
    private let deviceLabel = "Apple App"
    private var lastClaimTime: TimeInterval = 0
    private var lastLiveProgressEmitAt: TimeInterval = 0
    private var isRealtimeBound = false
    private var presenceTask: Task<Void, Never>?
    private var autosaveTask: Task<Void, Never>?
    private var player: AVPlayer?
    private var periodicObserver: Any?
    private var remoteCommandsConfigured = false
    private var playCommandTarget: Any?
    private var pauseCommandTarget: Any?
    private var skipForwardCommandTarget: Any?
    private var skipBackwardCommandTarget: Any?
    private var artworkTask: Task<Void, Never>?
    private var lastArtworkBookId: String?

    init(repository: PlayerRepository, authService: AuthService, realtime: RealtimeClient) {
        self.repository = repository
        self.authService = authService
        self.realtime = realtime
        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: "player_apple_device_id") {
            self.deviceId = existing
        } else {
            let generated = UUID().uuidString
            defaults.set(generated, forKey: "player_apple_device_id")
            self.deviceId = generated
        }
    }

    func load(bookId: String, title: String) async {
        bindRealtimeIfNeeded()
        state.isLoading = true
        state.errorMessage = nil
        state.bookId = bookId
        state.title = title

        do {
            async let settingsTask = repository.fetchSettings()
            async let playbackDetailsTask = repository.fetchPlaybackDetails(bookId: bookId)
            let resume = try await repository.resumeInfo(bookId: bookId)
            let dbProgress = try? await repository.fetchProgress(bookId: bookId)
            let settings = try await settingsTask
            let playbackDetails = try await playbackDetailsTask
            let authoritativePosition = Double(dbProgress?.positionSeconds ?? Int(resume.startSeconds))
            let playerSettings = settings.player
            state.streamPath = resume.streamPath
            state.streamURLString = repository.streamURL(streamPath: resume.streamPath).absoluteString
            state.startSeconds = resume.startSeconds
            state.positionSeconds = authoritativePosition
            state.durationSeconds = Double(dbProgress?.durationAtSave ?? Int(resume.durationSeconds))
            state.author = playbackDetails.author
            state.coverPath = playbackDetails.coverPath
            state.backwardJumpSeconds = Double(playerSettings.backwardJumpSeconds ?? 10)
            state.forwardJumpSeconds = Double(playerSettings.forwardJumpSeconds ?? 30)
            state.playbackRate = playerSettings.playbackRate ?? 1.0
            state.appliedRewind = resume.appliedRewind
            state.chapters = playbackDetails.chapters
            state.currentChapterIndex = chapterIndex(for: authoritativePosition)
            configurePlayerIfNeeded()
            seekPlayer(to: authoritativePosition)
            configureRemoteCommandsIfNeeded()
            updateNowPlayingInfo()
            loadNowPlayingArtworkIfNeeded()
            broadcastPresence()
        } catch {
            state.errorMessage = "Could not load playback data."
        }

        state.isLoading = false
    }

    func updatePosition(_ value: Double) {
        state.positionSeconds = value
        state.currentChapterIndex = chapterIndex(for: value)
        seekPlayer(to: value)
        updateNowPlayingInfo()
        broadcastLiveProgress(force: false)
    }

    func selectChapter(_ index: Int) {
        guard let chapter = state.chapters.first(where: { $0.index == index }) ?? state.chapters.dropFirst(index).first else {
            return
        }

        updatePosition(Double(chapter.start) / 1000)
    }

    func handleSkipBackwardMediaAction() {
        seekBy(-state.backwardJumpSeconds)
    }

    func handleSkipForwardMediaAction() {
        seekBy(state.forwardJumpSeconds)
    }

    private func seekBy(_ deltaSeconds: Double) {
        updatePosition(max(0, state.positionSeconds + deltaSeconds))
    }

    func playPressed() {
        configurePlayerIfNeeded()
        player?.playImmediately(atRate: Float(state.playbackRate))
        state.isPlaying = true
        state.activeDeviceLabel = nil
        updateNowPlayingInfo()
        claimPlaybackOwnership()
        broadcastPresence()
        startAutosaveLoop()
    }

    func pausePressed() {
        player?.pause()
        state.isPlaying = false
        updateNowPlayingInfo()
        broadcastPresence()
        stopAutosaveLoop()
        Task {
            await saveProgressSilently()
        }
    }

    func saveProgress() async {
        guard !state.bookId.isEmpty else {
            return
        }

        state.isSaving = true
        state.errorMessage = nil

        do {
            try await repository.saveProgress(
                bookId: state.bookId,
                positionSeconds: Int(state.positionSeconds),
                durationAtSave: max(Int(state.durationSeconds), 1)
            )
            broadcastLiveProgress(force: true)
        } catch {
            state.errorMessage = "Could not save progress."
        }

        state.isSaving = false
    }

    func reset() {
        player?.pause()
        state.isPlaying = false
        broadcastPresence()
        stopAutosaveLoop()
        artworkTask?.cancel()
        clearNowPlayingInfo()
        state = PlayerViewState()
    }

    deinit {
        stopAutosaveLoop()
        presenceTask?.cancel()
        if let periodicObserver {
            player?.removeTimeObserver(periodicObserver)
        }
        artworkTask?.cancel()
        removeRemoteCommandTargets()
        clearNowPlayingInfo()
        player?.pause()
        realtime.disconnect()
    }

    private func bindRealtimeIfNeeded() {
        guard !isRealtimeBound else {
            return
        }

        isRealtimeBound = true
        realtime.connect { [weak self] event in
            Task { @MainActor in
                self?.handleRealtimeEvent(event)
            }
        }

        presenceTask?.cancel()
        presenceTask = Task { [weak self] in
            while !(Task.isCancelled) {
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                await MainActor.run {
                    self?.broadcastPresence()
                }
            }
        }
    }

    private func configurePlayerIfNeeded() {
        guard let streamURLString = state.streamURLString,
              let url = URL(string: streamURLString)
        else {
            return
        }

        let currentURL = (player?.currentItem?.asset as? AVURLAsset)?.url.absoluteString
        if currentURL == streamURLString {
            return
        }

        if let periodicObserver {
            player?.removeTimeObserver(periodicObserver)
            self.periodicObserver = nil
        }

        let freshPlayer = AVPlayer(url: url)
        freshPlayer.automaticallyWaitsToMinimizeStalling = true
        let observer = freshPlayer.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 1, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self else {
                return
            }

            let seconds = CMTimeGetSeconds(time)
            if seconds.isFinite {
                self.state.positionSeconds = max(0, seconds)
                self.state.currentChapterIndex = self.chapterIndex(for: self.state.positionSeconds)
            }

            if let duration = freshPlayer.currentItem?.duration.seconds, duration.isFinite, duration > 0 {
                self.state.durationSeconds = duration
            }

            self.updateNowPlayingInfo()
            self.broadcastLiveProgress(force: false)
        }

        self.player = freshPlayer
        self.periodicObserver = observer
        if state.isPlaying {
            freshPlayer.playImmediately(atRate: Float(state.playbackRate))
        }
        updateNowPlayingInfo()
    }

    private func seekPlayer(to seconds: Double) {
        guard let player else {
            return
        }

        let clamped = max(0, seconds)
        player.seek(to: CMTime(seconds: clamped, preferredTimescale: 600))
    }

    private func handleRealtimeEvent(_ event: RealtimeEventEnvelope) {
        guard let payload = event.payload else {
            return
        }

        switch event.type {
        case "progress.synced":
            guard payload.string("userId") == authService.userId,
                  payload.string("bookId") == state.bookId,
                  !state.isPlaying
            else {
                return
            }

            Task {
                guard let snapshot = try? await repository.fetchProgress(bookId: state.bookId) else {
                    return
                }
                await MainActor.run {
                    state.positionSeconds = Double(snapshot.positionSeconds ?? Int(state.positionSeconds))
                    if let durationAtSave = snapshot.durationAtSave, durationAtSave > 0 {
                        state.durationSeconds = Double(durationAtSave)
                    }
                    state.currentChapterIndex = chapterIndex(for: state.positionSeconds)
                    seekPlayer(to: state.positionSeconds)
                    updateNowPlayingInfo()
                }
            }
        case "playback.session.presence":
            guard payload.string("userId") == authService.userId,
                  payload.string("deviceId") != deviceId,
                  payload.bool("paused") == false
            else {
                return
            }
            state.activeDeviceLabel = payload.string("label") ?? "another device"
        case "playback.claimed":
            guard payload.string("userId") == authService.userId,
                  payload.string("bookId") == state.bookId
            else {
                return
            }

            let claimDevice = payload.string("deviceId")
            let claimTime = ISO8601DateFormatter().date(from: payload.string("timestamp") ?? "")?.timeIntervalSince1970 ?? 0
            guard claimTime >= lastClaimTime else {
                return
            }

            lastClaimTime = claimTime
            if claimDevice != deviceId && state.isPlaying {
                player?.pause()
                state.isPlaying = false
                stopAutosaveLoop()
                updateNowPlayingInfo()
            }
        default:
            break
        }
    }

    private func claimPlaybackOwnership() {
        guard let userId = authService.userId, !state.bookId.isEmpty else {
            return
        }

        let now = Date()
        lastClaimTime = now.timeIntervalSince1970
        realtime.send(
            type: "playback.claim",
            payload: [
                "userId": userId,
                "deviceId": deviceId,
                "bookId": state.bookId,
                "timestamp": ISO8601DateFormatter().string(from: now),
            ]
        )
    }

    private func broadcastPresence() {
        guard let userId = authService.userId else {
            return
        }

        realtime.send(
            type: "playback.session.presence",
            payload: [
                "userId": userId,
                "deviceId": deviceId,
                "label": deviceLabel,
                "platform": "apple",
                "currentBookId": state.bookId.isEmpty ? NSNull() : state.bookId,
                "paused": !state.isPlaying,
            ]
        )
    }

    private func broadcastLiveProgress(force: Bool) {
        guard let userId = authService.userId,
              !state.bookId.isEmpty,
              state.durationSeconds > 0
        else {
            return
        }

        let now = Date().timeIntervalSince1970
        if !force && now - lastLiveProgressEmitAt < 2 {
            return
        }

        lastLiveProgressEmitAt = now
        realtime.send(
            type: "playback.progress",
            payload: [
                "userId": userId,
                "bookId": state.bookId,
                "positionSeconds": Int(state.positionSeconds),
                "durationAtSave": Int(state.durationSeconds),
                "completed": Int(state.positionSeconds) >= max(Int(state.durationSeconds) - 1, 0),
                "timestamp": ISO8601DateFormatter().string(from: Date()),
            ]
        )
    }

    private func startAutosaveLoop() {
        autosaveTask?.cancel()
        autosaveTask = Task { [weak self] in
            while !(Task.isCancelled) {
                try? await Task.sleep(nanoseconds: 15_000_000_000)
                await self?.saveProgressSilently()
            }
        }
    }

    private func stopAutosaveLoop() {
        autosaveTask?.cancel()
        autosaveTask = nil
    }

    private func saveProgressSilently() async {
        guard !state.bookId.isEmpty, state.durationSeconds > 0 else {
            return
        }

        try? await repository.saveProgress(
            bookId: state.bookId,
            positionSeconds: Int(state.positionSeconds),
            durationAtSave: max(Int(state.durationSeconds), 1)
        )
        broadcastLiveProgress(force: true)
    }

    private func configureRemoteCommandsIfNeeded() {
        guard !remoteCommandsConfigured else {
            return
        }

        remoteCommandsConfigured = true
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.isEnabled = true
        center.pauseCommand.isEnabled = true
        center.skipForwardCommand.isEnabled = true
        center.skipBackwardCommand.isEnabled = true

        center.skipForwardCommand.preferredIntervals = [NSNumber(value: state.forwardJumpSeconds)]
        center.skipBackwardCommand.preferredIntervals = [NSNumber(value: state.backwardJumpSeconds)]

        playCommandTarget = center.playCommand.addTarget { [weak self] _ in
            guard let self else {
                return .commandFailed
            }

            self.playPressed()
            return .success
        }

        pauseCommandTarget = center.pauseCommand.addTarget { [weak self] _ in
            guard let self else {
                return .commandFailed
            }

            self.pausePressed()
            return .success
        }

        skipForwardCommandTarget = center.skipForwardCommand.addTarget { [weak self] _ in
            guard let self else {
                return .commandFailed
            }

            self.handleSkipForwardMediaAction()
            return .success
        }

        skipBackwardCommandTarget = center.skipBackwardCommand.addTarget { [weak self] _ in
            guard let self else {
                return .commandFailed
            }

            self.handleSkipBackwardMediaAction()
            return .success
        }
    }

    private func updateNowPlayingInfo() {
        guard !state.bookId.isEmpty else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }

        var info: [String: Any] = [
            MPMediaItemPropertyTitle: state.title,
            MPMediaItemPropertyArtist: state.author ?? "Unknown author",
            MPNowPlayingInfoPropertyElapsedPlaybackTime: state.positionSeconds,
            MPMediaItemPropertyPlaybackDuration: max(state.durationSeconds, 0),
            MPNowPlayingInfoPropertyPlaybackRate: state.isPlaying ? state.playbackRate : 0,
        ]

        if let fallbackArtwork = fallbackNowPlayingArtwork() {
            info[MPMediaItemPropertyArtwork] = fallbackArtwork
        }

        if let chapter = state.chapters[safe: state.currentChapterIndex] {
            info[MPNowPlayingInfoPropertyChapterNumber] = chapter.index + 1
            info[MPMediaItemPropertyAlbumTitle] = chapter.title
        }

        MPRemoteCommandCenter.shared().skipForwardCommand.preferredIntervals = [NSNumber(value: state.forwardJumpSeconds)]
        MPRemoteCommandCenter.shared().skipBackwardCommand.preferredIntervals = [NSNumber(value: state.backwardJumpSeconds)]
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func loadNowPlayingArtworkIfNeeded() {
        guard !state.bookId.isEmpty, state.coverPath != nil else {
            return
        }

        guard lastArtworkBookId != state.bookId else {
            return
        }

        lastArtworkBookId = state.bookId
        artworkTask?.cancel()
        artworkTask = Task { [weak self] in
            guard let self else {
                return
            }

            let coverURL = repository.streamURL(streamPath: "streaming/books/\(state.bookId)/cover")
            var request = URLRequest(url: coverURL)
            if let token = authService.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            guard let (data, response) = try? await URLSession.shared.data(for: request),
                  let http = response as? HTTPURLResponse,
                  (200...299).contains(http.statusCode),
                  let artwork = makeNowPlayingArtwork(from: data)
            else {
                return
            }

            await MainActor.run {
                guard state.bookId == lastArtworkBookId else {
                    return
                }

                var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
                info[MPMediaItemPropertyArtwork] = artwork
                MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            }
        }
    }

    private func makeNowPlayingArtwork(from data: Data) -> MPMediaItemArtwork? {
        #if canImport(UIKit)
        guard let image = PlatformImage(data: data) else {
            return nil
        }
        return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        #elseif canImport(AppKit)
        guard let image = PlatformImage(data: data) else {
            return nil
        }
        return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        #else
        return nil
        #endif
    }

    private func fallbackNowPlayingArtwork() -> MPMediaItemArtwork? {
        #if canImport(UIKit)
        let size = CGSize(width: 256, height: 256)
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { context in
            UIColor(red: 0.16, green: 0.23, blue: 0.35, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
        }
        return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        #elseif canImport(AppKit)
        let size = CGSize(width: 256, height: 256)
        let image = PlatformImage(size: size)
        image.lockFocus()
        NSColor(calibratedRed: 0.16, green: 0.23, blue: 0.35, alpha: 1).setFill()
        NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()
        image.unlockFocus()
        return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        #else
        return nil
        #endif
    }

    private func clearNowPlayingInfo() {
        lastArtworkBookId = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    private func removeRemoteCommandTargets() {
        guard remoteCommandsConfigured else {
            return
        }

        let center = MPRemoteCommandCenter.shared()
        if let playCommandTarget {
            center.playCommand.removeTarget(playCommandTarget)
        }
        if let pauseCommandTarget {
            center.pauseCommand.removeTarget(pauseCommandTarget)
        }
        if let skipForwardCommandTarget {
            center.skipForwardCommand.removeTarget(skipForwardCommandTarget)
        }
        if let skipBackwardCommandTarget {
            center.skipBackwardCommand.removeTarget(skipBackwardCommandTarget)
        }
        remoteCommandsConfigured = false
    }

    private func chapterIndex(for positionSeconds: Double) -> Int {
        guard !state.chapters.isEmpty else {
            return 0
        }

        let positionMilliseconds = Int(positionSeconds * 1000)
        if let match = state.chapters.lastIndex(where: { chapter in
            positionMilliseconds >= chapter.start && (chapter.end <= chapter.start || positionMilliseconds < chapter.end)
        }) {
            return match
        }

        if let last = state.chapters.last, positionMilliseconds >= last.start {
            return state.chapters.count - 1
        }

        return 0
    }
}

private extension Array {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

private extension Dictionary where Key == String, Value == RealtimeJSONValue {
    func string(_ key: String) -> String? {
        guard let value = self[key] else {
            return nil
        }
        if case .string(let text) = value {
            return text
        }
        return nil
    }

    func bool(_ key: String) -> Bool? {
        guard let value = self[key] else {
            return nil
        }
        if case .bool(let flag) = value {
            return flag
        }
        return nil
    }
}
