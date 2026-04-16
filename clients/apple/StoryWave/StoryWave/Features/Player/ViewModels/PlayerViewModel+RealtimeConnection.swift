import Foundation
import AudiobookCore

/*
 Purpose:
 Realtime connection lifecycle and outbound playback signalling.

 Scope:
 - WebSocket binding
 - Presence broadcasts
 - Live progress broadcasts
 - Ownership claim broadcasts
*/
extension PlayerViewModel {

    // MARK: Connection

    func bindRealtimeIfNeeded() {
        guard !isRealtimeBound else { return }
        isRealtimeBound = true

        realtime.connect()
        realtimeSubscriptionID = realtime.subscribe { [weak self] event in
            Task { @MainActor in
                self?.handleRealtimeEvent(event)
            }
        }

        presenceTask?.cancel()
        presenceTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: self?.presenceBroadcastInterval ?? 10_000_000_000)
                guard let self else { break }
                await MainActor.run { self.broadcastPresence() }
            }
        }
    }

    // MARK: Presence Broadcast

    func broadcastPresence() {
        guard let userId = authService.userId else { return }

        realtime.send(
            type: "playback.session.presence",
            payload: [
                "userId":        userId,
                "deviceId":      deviceId,
                "label":         deviceLabel,
                "platform":      "apple",
                "currentBookId": state.bookId.isEmpty ? NSNull() : state.bookId,
                "paused":        !state.isPlaying,
                "timestamp":     ISO8601DateFormatter().string(from: Date()),
            ]
        )

        // Mirror local presence into the map so mini-player sees it immediately.
        presenceByDeviceId[deviceId] = PlaybackPresence(
            deviceId: deviceId,
            label: deviceLabel,
            currentBookId: state.bookId.isEmpty ? nil : state.bookId,
            paused: !state.isPlaying,
            timestamp: Date()
        )
        pruneStalePresence()
        resolveActivePresence()
    }

    // MARK: Live Progress Broadcast

    func broadcastLiveProgress(force: Bool) {
        guard let userId = authService.userId,
              !state.bookId.isEmpty,
              state.durationSeconds > 0 else { return }

        let now = Date().timeIntervalSince1970
        if !force, now - lastLiveProgressEmitAt < liveProgressDebounceInterval { return }
        lastLiveProgressEmitAt = now

        realtime.send(
            type: "playback.progress",
            payload: [
                "userId":         userId,
                "bookId":         state.bookId,
                "positionSeconds": Int(state.positionSeconds.rounded()),
                "durationAtSave":  Int(state.durationSeconds.rounded()),
                "completed":       Int(state.positionSeconds) >= max(Int(state.durationSeconds) - 1, 0),
                "timestamp":       ISO8601DateFormatter().string(from: Date()),
            ]
        )
    }

    // MARK: Ownership Claim

    func claimPlaybackOwnership() {
        guard let userId = authService.userId, !state.bookId.isEmpty else { return }
        let now = Date()
        lastClaimTime = now.timeIntervalSince1970
        lastLocalTakeoverAt = now.timeIntervalSince1970
        realtime.send(
            type: "playback.claim",
            payload: [
                "userId":    userId,
                "deviceId":  deviceId,
                "bookId":    state.bookId,
                "label":     deviceLabel,
                "timestamp": ISO8601DateFormatter().string(from: now),
            ]
        )
    }
}
