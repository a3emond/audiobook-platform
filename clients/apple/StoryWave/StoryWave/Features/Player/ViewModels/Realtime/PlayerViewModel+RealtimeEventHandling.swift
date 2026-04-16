import Foundation
import AudiobookCore

/*
 Purpose:
 Inbound realtime event handling for the player session.

 Scope:
 - progress.synced reconciliation
 - playback.session.presence updates
 - playback.claimed ownership transfer
*/
extension PlayerViewModel {

    // MARK: Event Handling

    func handleRealtimeEvent(_ event: RealtimeEventEnvelope) {
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
                label: payload.string("label") ?? "another device",
                currentBookId: payload.string("currentBookId"),
                paused: payload.bool("paused") ?? true,
                timestamp: ISO8601DateFormatter().date(from: payload.string("timestamp") ?? "") ?? Date()
            )
            pruneStalePresence()
            resolveActivePresence()

            // Fast handshake: when another device announces itself, immediately reply
            // with our own presence so they discover us without waiting for the next
            // 5-second timer tick. This is exactly what the Angular web client does.
            if presenceDeviceId != deviceId {
                broadcastPresence()
            }

        case "playback.claimed":
            guard payload.string("userId") == authService.userId else { return }

            let claimDevice = payload.string("deviceId")
            let claimedBookId = payload.string("bookId")
            let claimTime = ISO8601DateFormatter()
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

                state.activeDeviceLabel = payload.string("label") ?? state.activeDeviceLabel
                state.isRemotePlaybackActive = true
                state.remoteBookId = claimedBookId

                if let claimedBookId, !claimedBookId.isEmpty {
                    if claimedBookId == state.bookId {
                        state.remoteTitle = state.title
                        state.remoteAuthor = state.author
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
}
