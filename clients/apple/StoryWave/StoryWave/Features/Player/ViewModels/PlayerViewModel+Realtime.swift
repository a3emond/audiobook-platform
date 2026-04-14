import Foundation
import AudiobookCore
import AVFoundation

// MARK: - Realtime / WebSocket

extension PlayerViewModel {

    // MARK: Connection

    func bindRealtimeIfNeeded() {
        guard !isRealtimeBound else { return }
        isRealtimeBound = true

        realtime.connect { [weak self] event in
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

    // MARK: Event Handling

    private func handleRealtimeEvent(_ event: RealtimeEventEnvelope) {
        guard let payload = event.payload else { return }

        switch event.type {

        case "progress.synced":
            guard payload.string("userId") == authService.userId,
                  payload.string("bookId") == state.bookId,
                  !state.isPlaying else { return }

            Task {
                let chapterMax = state.chapters.map(\.end).max()
                guard let snapshot = try? await repository.fetchProgressLegacy(bookId: state.bookId)
                else { return }
                await MainActor.run {
                    if let pos = snapshot.positionSeconds {
                        state.positionSeconds = normalizedServerSeconds(Double(pos), chapterMaxRaw: chapterMax)
                    }
                    if let dur = snapshot.durationAtSave, dur > 0 {
                        state.durationSeconds = normalizedServerSeconds(Double(dur), chapterMaxRaw: chapterMax)
                    }
                    state.currentChapterIndex = chapterIndex(for: state.positionSeconds)
                    seekPlayer(to: state.positionSeconds)
                    updateNowPlayingInfo()
                }
            }

        case "playback.session.presence":
            guard payload.string("userId") == authService.userId else { return }
            let presenceDeviceId = payload.string("deviceId") ?? ""
            guard !presenceDeviceId.isEmpty else { return }

            presenceByDeviceId[presenceDeviceId] = PlaybackPresence(
                deviceId: presenceDeviceId,
                label:    payload.string("label") ?? "another device",
                currentBookId: payload.string("currentBookId"),
                paused:   payload.bool("paused") ?? true,
                timestamp: ISO8601DateFormatter().date(from: payload.string("timestamp") ?? "") ?? Date()
            )
            pruneStalePresence()
            resolveActivePresence()

        case "playback.claimed":
            guard payload.string("userId") == authService.userId else { return }

            let claimDevice = payload.string("deviceId")
            let claimedBookId = payload.string("bookId")
            let claimTime   = ISO8601DateFormatter()
                .date(from: payload.string("timestamp") ?? "")?.timeIntervalSince1970 ?? 0
            // Keep anti-stale protection for local echoes only. Remote claims must
            // remain authoritative even with cross-device clock skew.
            if claimDevice == deviceId, claimTime < lastClaimTime {
                return
            }
            if claimTime >= lastClaimTime {
                lastClaimTime = claimTime
            }

            if claimDevice != deviceId {
                forceStopForRemoteTakeover()

                state.activeDeviceLabel      = payload.string("label") ?? state.activeDeviceLabel
                state.isRemotePlaybackActive = true
                state.remoteBookId           = claimedBookId

                if let claimedBookId, !claimedBookId.isEmpty {
                    if claimedBookId == state.bookId {
                        state.remoteTitle          = state.title
                        state.remoteAuthor         = state.author
                        state.remoteCoverURLString = state.coverURLString
                    } else {
                        hydrateRemoteBook(claimedBookId)
                    }
                } else {
                    state.remoteTitle = nil
                    state.remoteAuthor = nil
                    state.remoteCoverURLString = nil
                }

                // Keep lock-screen / media center focused on the active owning device.
                clearNowPlayingInfo()
            } else {
                state.activeDeviceLabel = nil
                state.isRemotePlaybackActive = false
                state.remoteBookId = nil
                state.remoteTitle = nil
                state.remoteAuthor = nil
                state.remoteCoverURLString = nil
            }

        default:
            break
        }
    }

    // MARK: Presence Tracking

    private func pruneStalePresence() {
        let cutoff = Date().addingTimeInterval(-35)
        presenceByDeviceId = presenceByDeviceId.filter { $0.value.timestamp >= cutoff }
    }

    private func resolveActivePresence() {
        let now = Date().timeIntervalSince1970
        let shouldPreferLocalTakeover = isLocallyPlayingOrBuffering()
            && (now - lastLocalTakeoverAt) <= 8

        let remoteActive = presenceByDeviceId.values
            .filter { $0.deviceId != deviceId && !$0.paused }
            .sorted { $0.timestamp > $1.timestamp }
            .first

        if shouldPreferLocalTakeover {
            state.activeDeviceLabel      = nil
            state.isRemotePlaybackActive = false
            state.remoteBookId           = nil
            state.remoteTitle            = nil
            state.remoteAuthor           = nil
            state.remoteCoverURLString   = nil
            return
        }

        guard let remoteActive else {
            state.activeDeviceLabel      = nil
            state.isRemotePlaybackActive = false
            state.remoteBookId           = nil
            state.remoteTitle            = nil
            state.remoteAuthor           = nil
            state.remoteCoverURLString   = nil

            if !state.bookId.isEmpty {
                updateNowPlayingInfo()
            }
            return
        }

        state.activeDeviceLabel      = remoteActive.label
        state.isRemotePlaybackActive = true
        state.remoteBookId           = remoteActive.currentBookId

        if isLocallyPlayingOrBuffering() {
            forceStopForRemoteTakeover()
        }
        clearNowPlayingInfo()

        guard let remoteBookId = remoteActive.currentBookId, !remoteBookId.isEmpty else {
            state.remoteTitle = nil; state.remoteAuthor = nil; state.remoteCoverURLString = nil
            return
        }

        // Reuse already-loaded metadata when the remote book is the same as the local one.
        if remoteBookId == state.bookId {
            state.remoteTitle          = state.title
            state.remoteAuthor         = state.author
            state.remoteCoverURLString = state.coverURLString
            return
        }

        // Skip a redundant fetch if we already have the metadata for this remote book.
        if state.remoteBookId == remoteBookId, state.remoteTitle != nil { return }

        hydrateRemoteBook(remoteBookId)
    }

    // MARK: Remote Book Metadata

    private func hydrateRemoteBook(_ bookId: String) {
        let requestId = remoteBookFetchRequestId + 1
        remoteBookFetchRequestId = requestId

        Task {
            guard let book = try? await repository.fetchBook(bookId: bookId) else { return }
            await MainActor.run {
                guard requestId == self.remoteBookFetchRequestId,
                      self.state.remoteBookId == bookId,
                      self.state.isRemotePlaybackActive else { return }
                self.state.remoteTitle  = book.title
                self.state.remoteAuthor = book.author
                self.state.remoteCoverURLString = self.authenticatedMediaURLString(for: "streaming/books/\(bookId)/cover")
            }
        }
    }

    // MARK: Remote Takeover

    private func isLocallyPlayingOrBuffering() -> Bool {
        if state.isPlaying { return true }
        guard let player else { return false }
        return player.rate > 0 || player.timeControlStatus == .waitingToPlayAtSpecifiedRate
    }

    private func forceStopForRemoteTakeover() {
        guard isLocallyPlayingOrBuffering() else {
            broadcastPresence()
            return
        }

        player?.pause()
        state.isPlaying = false
        pauseSleepTimerCountdown()
        stopAutosaveLoop()
        clearNowPlayingInfo()
        broadcastPresence()
        Task { await saveProgressSilently() }
    }
}
