import Foundation
import AVFoundation
import AudiobookCore

/*
 Purpose:
 Presence-map reconciliation and remote takeover behavior.

 Scope:
 - Presence pruning
 - Active device resolution
 - Remote book metadata hydration
 - Local playback stop when another device claims ownership
*/
extension PlayerViewModel {

    // MARK: Presence Tracking

    func pruneStalePresence() {
        let cutoff = Date().addingTimeInterval(-35)
        presenceByDeviceId = presenceByDeviceId.filter { $0.value.timestamp >= cutoff }
    }

    func resolveActivePresence() {
        let now = Date().timeIntervalSince1970
        let shouldPreferLocalTakeover = isLocallyPlayingOrBuffering()
            && (now - lastLocalTakeoverAt) <= 8

        let remoteActive = presenceByDeviceId.values
            .filter { $0.deviceId != deviceId && !$0.paused }
            .sorted { $0.timestamp > $1.timestamp }
            .first

        if shouldPreferLocalTakeover {
            state.activeDeviceLabel = nil
            state.isRemotePlaybackActive = false
            state.remoteBookId = nil
            state.remoteTitle = nil
            state.remoteAuthor = nil
            state.remoteCoverURLString = nil
            return
        }

        guard let remoteActive else {
            state.activeDeviceLabel = nil
            state.isRemotePlaybackActive = false
            state.remoteBookId = nil
            state.remoteTitle = nil
            state.remoteAuthor = nil
            state.remoteCoverURLString = nil

            if !state.bookId.isEmpty {
                updateNowPlayingInfo()
            }
            return
        }

        state.activeDeviceLabel = remoteActive.label
        state.isRemotePlaybackActive = true
        state.remoteBookId = remoteActive.currentBookId

        if isLocallyPlayingOrBuffering() {
            forceStopForRemoteTakeover()
        }
        clearNowPlayingInfo()

        guard let remoteBookId = remoteActive.currentBookId, !remoteBookId.isEmpty else {
            state.remoteTitle = nil
            state.remoteAuthor = nil
            state.remoteCoverURLString = nil
            return
        }

        // Reuse already-loaded metadata when the remote book is the same as the local one.
        if remoteBookId == state.bookId {
            state.remoteTitle = state.title
            state.remoteAuthor = state.author
            state.remoteCoverURLString = state.coverURLString
            return
        }

        // Skip a redundant fetch if we already have the metadata for this remote book.
        if state.remoteBookId == remoteBookId, state.remoteTitle != nil { return }

        hydrateRemoteBook(remoteBookId)
    }

    // MARK: Remote Book Metadata

    func hydrateRemoteBook(_ bookId: String) {
        let requestId = remoteBookFetchRequestId + 1
        remoteBookFetchRequestId = requestId

        Task {
            guard let book = try? await repository.fetchBook(bookId: bookId) else { return }
            await MainActor.run {
                guard requestId == self.remoteBookFetchRequestId,
                      self.state.remoteBookId == bookId,
                      self.state.isRemotePlaybackActive else { return }
                self.state.remoteTitle = book.title
                self.state.remoteAuthor = book.author
                self.state.remoteCoverURLString = self.authenticatedMediaURLString(for: "streaming/books/\(bookId)/cover")
            }
        }
    }

    // MARK: Remote Takeover

    func isLocallyPlayingOrBuffering() -> Bool {
        if state.isPlaying { return true }
        guard let player else { return false }
        return player.rate > 0 || player.timeControlStatus == .waitingToPlayAtSpecifiedRate
    }

    func forceStopForRemoteTakeover() {
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
