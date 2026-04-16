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

        startPresenceLoop()
    }

    /// Starts (or restarts) the periodic presence heartbeat loop.
    ///
    /// Safe to call multiple times: always cancels any existing loop first so
    /// there is exactly one running timer at any point.
    func startPresenceLoop() {
        presenceTask?.cancel()
        presenceTask = Task { [weak self] in
            // Broadcast immediately so remote devices know about this device on
            // (re)connect, without waiting for the first 5-second sleep to elapse.
            if let self, !Task.isCancelled {
                await MainActor.run { self.broadcastPresence() }
            }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: self?.presenceBroadcastInterval ?? 5_000_000_000)
                guard let self, !Task.isCancelled else { break }
                await MainActor.run { self.broadcastPresence() }
            }
        }
    }

    /// Re-registers the realtime event subscription after an auth lifecycle change.
    ///
    /// Called after authentication succeeds so the subscription is always bound to
    /// a live connection rather than a pre-auth socket that may have been reset.
    func rebindRealtime() {
        if let existing = realtimeSubscriptionID {
            realtime.unsubscribe(existing)
            realtimeSubscriptionID = nil
        }
        isRealtimeBound = false
        bindRealtimeIfNeeded()
        // Always restart the heartbeat after a rebind — the old loop was tied to
        // the previous subscription and may have been cancelled.
        startPresenceLoop()
    }

    func refreshRealtimeSessionOnAppActivation() {
        rebindRealtime()

        if isLocallyPlayingOrBuffering() {
            claimPlaybackOwnership()
        }

        broadcastPresence()
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
