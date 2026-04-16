import Foundation
import AudiobookCore

// MARK: - Sleep Timer

extension PlayerViewModel {

    // MARK: Public API

    func setSleepTimerMode(_ mode: PlayerSleepTimerMode) {
        guard state.sleepTimerMode != mode else { return }
        state.sleepTimerMode = mode
        resetSleepTimerForMode()
        Task {
            let payload = UpdateSettingsPayloadDTO(
                player: SettingsDTO.PlayerDTO(
                    forwardJumpSeconds: nil,
                    backwardJumpSeconds: nil,
                    playbackRate: nil,
                    sleepTimerMode: mode.rawValue,
                    resumeRewind: nil
                )
            )
            _ = try? await repository.updateSettings(payload: payload)
        }
    }

    func sleepTimerLabel() -> String {
        switch state.sleepTimerMode {
        case .fifteenMinutes:   return "15 min"
        case .thirtyMinutes:    return "30 min"
        case .fortyFiveMinutes: return "45 min"
        case .sixtyMinutes:     return "1 h"
        case .chapter:          return "End chapter"
        case .off:              return "Disabled"
        }
    }

    // MARK: State Machine

    func resetSleepTimerForMode() {
        sleepTimerTask?.cancel()
        sleepTimerTask = nil
        sleepStartedAt = nil
        sleepPausedAt  = nil
        chapterSleepTargetSeconds = nil

        switch state.sleepTimerMode {
        case .off, .chapter:
            sleepRemainingMs = nil
        default:
            sleepRemainingMs = sleepModeMinutes[state.sleepTimerMode].map { $0 * 60_000 }
        }

        if state.isPlaying {
            armSleepTimerForPlayback()
        } else {
            state.sleepTimerCountdownText = sleepTimerCountdownText(now: Date())
        }
    }

    func armSleepTimerForPlayback() {
        switch state.sleepTimerMode {
        case .off:
            sleepPausedAt = nil
            state.sleepTimerCountdownText = nil
            return
        case .chapter:
            sleepPausedAt = nil
            chapterSleepTargetSeconds = activeChapterEndSeconds()
            state.sleepTimerCountdownText = sleepTimerCountdownText(now: Date())
            return
        default:
            break
        }

        guard let minutes = sleepModeMinutes[state.sleepTimerMode] else { return }

        if let pausedAt = sleepPausedAt,
           Date().timeIntervalSince(pausedAt) > sleepPauseResetSeconds {
            sleepRemainingMs = minutes * 60_000
        }

        sleepPausedAt = nil
        if (sleepRemainingMs ?? 0) <= 0 { sleepRemainingMs = minutes * 60_000 }

        sleepTimerTask?.cancel()
        sleepStartedAt = Date()

        guard let remaining = sleepRemainingMs else { return }

        sleepTimerTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(max(remaining, 0)) * 1_000_000)
            await MainActor.run {
                guard let self else { return }
                self.sleepStartedAt = nil
                self.sleepPausedAt  = Date()
                self.sleepRemainingMs = 0
                self.pausePressed()
            }
        }
        state.sleepTimerCountdownText = sleepTimerCountdownText(now: Date())
    }

    func pauseSleepTimerCountdown() {
        if state.sleepTimerMode == .chapter {
            sleepPausedAt = Date()
            return
        }
        if let startedAt = sleepStartedAt, let remaining = sleepRemainingMs {
            sleepRemainingMs = max(0, remaining - Int(Date().timeIntervalSince(startedAt) * 1000))
        }
        sleepTimerTask?.cancel()
        sleepTimerTask = nil
        sleepStartedAt = nil
        sleepPausedAt  = Date()
        state.sleepTimerCountdownText = sleepTimerCountdownText(now: Date())
    }

    func handleSleepTimerTick(currentPositionSeconds: Double) {
        state.sleepTimerCountdownText = sleepTimerCountdownText(now: Date())
        guard state.sleepTimerMode == .chapter,
              state.isPlaying,
              let target = chapterSleepTargetSeconds else { return }

        if currentPositionSeconds >= target {
            chapterSleepTargetSeconds = nil
            pausePressed()
        }
    }

    func refreshChapterSleepTargetIfNeeded() {
        guard state.sleepTimerMode == .chapter, state.isPlaying else { return }
        chapterSleepTargetSeconds = activeChapterEndSeconds()
        state.sleepTimerCountdownText = sleepTimerCountdownText(now: Date())
    }

    // MARK: Private Helpers

    private func activeChapterEndSeconds() -> Double? {
        guard let chapter = activeChapter() else { return nil }
        return chapterEndSeconds(chapter)
    }

    private func sleepTimerCountdownText(now: Date) -> String? {
        switch state.sleepTimerMode {
        case .off:     return nil
        case .chapter: return "Chapter end"
        default:       break
        }
        guard let baseMs = sleepRemainingMs else { return nil }

        var remainingMs = baseMs
        if let startedAt = sleepStartedAt {
            remainingMs = max(0, remainingMs - Int(now.timeIntervalSince(startedAt) * 1000))
        }
        let total   = Int(ceil(Double(remainingMs) / 1000.0))
        let minutes = total / 60
        let seconds = total % 60
        return "\(minutes):\(String(format: "%02d", seconds))"
    }
}
