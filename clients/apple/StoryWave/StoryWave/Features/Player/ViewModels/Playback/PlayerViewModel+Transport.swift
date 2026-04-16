import Foundation
import AVFoundation
import MediaPlayer
import AudiobookCore

// MARK: - Transport Controls

extension PlayerViewModel {

    func markCompletedPressed() async {
        guard !state.bookId.isEmpty else { return }

        state.isSaving = true
        defer { state.isSaving = false }

        do {
            _ = try await repository.markCompleted(bookId: state.bookId)
            state.isCompleted = true
            state.errorMessage = nil
            appCacheService.invalidateLibrary()
            broadcastLiveProgress(force: true)
        } catch {
            state.errorMessage = "Could not mark this book as completed."
        }
    }

    // MARK: Play / Pause

    func playPressed() {
        // Refresh the socket path before claiming playback ownership so iOS foreground /
        // background transitions do not leave this device sending claims on a stale socket.
        refreshRealtimeSessionOnAppActivation()
        configurePlayerIfNeeded()
        player?.playImmediately(atRate: Float(state.playbackRate))
        state.isPlaying = true
        state.activeDeviceLabel = nil
        state.isRemotePlaybackActive = false
        state.remoteBookId = nil
        state.remoteTitle = nil
        state.remoteAuthor = nil
        state.remoteCoverURLString = nil
        armSleepTimerForPlayback()
        updateNowPlayingInfo()
        claimPlaybackOwnership()
        broadcastPresence()
        startAutosaveLoop()
    }

    func pausePressed() {
        player?.pause()
        state.isPlaying = false
        pauseSleepTimerCountdown()
        updateNowPlayingInfo()
        broadcastPresence()
        stopAutosaveLoop()
        Task { await saveProgressSilently() }
    }

    // MARK: Media Buttons

    func handleSkipBackwardMediaAction() { seekBy(-state.backwardJumpSeconds, source: .mediaCommand) }
    func handleSkipForwardMediaAction()  { seekBy(state.forwardJumpSeconds, source: .mediaCommand) }

    // MARK: Position Update

    func updatePosition(_ value: Double) {
        let upperBound = resolvedSeekUpperBound(candidate: value)
        let clamped = min(max(0, value), upperBound)
        state.positionSeconds = clamped
        state.currentChapterIndex = chapterIndex(for: clamped)
        seekPlayer(to: clamped)
        refreshChapterSleepTargetIfNeeded()
        updateNowPlayingInfo()
        broadcastLiveProgress(force: false)
    }

    // MARK: Progress Save

    func saveProgress() async {
        guard !state.bookId.isEmpty else { return }
        state.isSaving = true
        state.errorMessage = nil
        do {
            try await repository.saveProgress(
                bookId: state.bookId,
                positionSeconds: Int(state.positionSeconds.rounded()),
                durationAtSave: max(Int(state.durationSeconds), 1),
                lastChapterIndex: state.currentChapterIndex,
                secondsIntoChapter: chapterOffsetSeconds()
            )
            appCacheService.invalidateLibrary()
            broadcastLiveProgress(force: true)
        } catch {
            state.errorMessage = "Could not save progress."
        }
        state.isSaving = false
    }

    // MARK: AVPlayer Configuration

    func configurePlayerIfNeeded() {
        guard let streamURLString = state.streamURLString,
              let url = URL(string: streamURLString) else { return }

        let currentURL = (player?.currentItem?.asset as? AVURLAsset)?.url.absoluteString
        if currentURL == streamURLString { return }

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
            guard let self else { return }
            Task { @MainActor in
                let seconds = CMTimeGetSeconds(time)
                if seconds.isFinite {
                    self.state.positionSeconds = max(0, seconds)
                    self.state.currentChapterIndex = self.chapterIndex(for: self.state.positionSeconds)
                    self.handleSleepTimerTick(currentPositionSeconds: self.state.positionSeconds)
                }
                if let duration = freshPlayer.currentItem?.duration.seconds,
                   duration.isFinite, duration > 0 {
                    self.state.durationSeconds = duration
                }
                self.updateNowPlayingInfo()
                self.broadcastLiveProgress(force: false)
            }
        }

        self.player = freshPlayer
        self.periodicObserver = observer
        if state.isPlaying {
            freshPlayer.playImmediately(atRate: Float(state.playbackRate))
        }
        updateNowPlayingInfo()
    }

    func seekPlayer(to seconds: Double) {
        player?.seek(to: CMTime(seconds: max(0, seconds), preferredTimescale: 600))
    }

    // MARK: Autosave Loop

    func startAutosaveLoop() {
        autosaveTask?.cancel()
        autosaveTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: self?.autosaveInterval ?? 15_000_000_000)
                guard let self else { break }
                await self.saveProgressSilently()
            }
        }
    }

    func stopAutosaveLoop() {
        autosaveTask?.cancel()
        autosaveTask = nil
    }

    // MARK: Private Helpers

    private enum SeekSource {
        case user
        case mediaCommand
    }

    private func seekBy(_ deltaSeconds: Double, source: SeekSource = .user) {
        let basePosition: Double
        if source == .mediaCommand, let player {
            let current = player.currentTime().seconds
            basePosition = current.isFinite ? max(0, current) : state.positionSeconds
        } else {
            basePosition = state.positionSeconds
        }

        updatePosition(max(0, basePosition + deltaSeconds))
    }

    private func resolvedSeekUpperBound(candidate: Double) -> Double {
        var candidates: [Double] = []
        if state.durationSeconds > 0 { candidates.append(state.durationSeconds) }
        if let playerDuration = player?.currentItem?.duration.seconds,
           playerDuration.isFinite,
           playerDuration > 0 {
            candidates.append(playerDuration)
        }
        if let chapterMax = state.chapters.map(\.end).max() {
            let normalizedChapterMax = normalizedServerSeconds(Double(chapterMax), chapterMaxRaw: chapterMax)
            if normalizedChapterMax > 0 { candidates.append(normalizedChapterMax) }
        }

        if let best = candidates.max() {
            return best
        }
        // Keep seeking responsive before stream duration is known.
        return max(candidate, state.positionSeconds + 3600)
    }

    func saveProgressSilently() async {
        guard !state.bookId.isEmpty, state.durationSeconds > 0 else { return }
        try? await repository.saveProgress(
            bookId: state.bookId,
            positionSeconds: Int(state.positionSeconds.rounded()),
            durationAtSave: max(Int(state.durationSeconds), 1),
            lastChapterIndex: state.currentChapterIndex,
            secondsIntoChapter: chapterOffsetSeconds()
        )
        appCacheService.invalidateLibrary()
        broadcastLiveProgress(force: true)
    }

    private func chapterOffsetSeconds() -> Int {
        guard let chapter = state.chapters[safe: state.currentChapterIndex] else { return 0 }
        return max(0, Int(state.positionSeconds - chapterStartSeconds(chapter)))
    }
}
