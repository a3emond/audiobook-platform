import Foundation

// MARK: - Mini Player Facade

extension PlayerViewModel {

    // MARK: Visibility

    /// Whether the mini player bar should be visible anywhere in the app.
    func miniPlayerIsVisible() -> Bool {
        !state.bookId.isEmpty || state.isRemotePlaybackActive
    }

    // MARK: Content

    /// The book ID to navigate to when the mini player is tapped.
    func miniPlayerBookId() -> String? {
        if state.isRemotePlaybackActive {
            if let remoteBookId = state.remoteBookId, !remoteBookId.isEmpty {
                return remoteBookId
            }
            return state.bookId.isEmpty ? nil : state.bookId
        }
        return state.bookId.isEmpty ? nil : state.bookId
    }

    func miniPlayerTitle() -> String {
        state.isRemotePlaybackActive
            ? (state.remoteTitle ?? "Live playback")
            : (state.title.isEmpty ? "Now Playing" : state.title)
    }

    func miniPlayerAuthor() -> String {
        if state.isRemotePlaybackActive {
            return state.remoteAuthor
                ?? state.activeDeviceLabel.map { "Playing on \($0)" }
                ?? "Playing remotely"
        }
        return state.author ?? "Now Playing"
    }

    func miniPlayerCoverURLString() -> String? {
        state.isRemotePlaybackActive ? state.remoteCoverURLString : state.coverURLString
    }

    // MARK: Transport Gating

    /// `true` when this device owns the session and transport buttons should be shown.
    func canControlMiniPlayerTransport() -> Bool {
        !state.bookId.isEmpty && !state.isRemotePlaybackActive
    }

    // MARK: Listen Here

    /// Claims playback on this device, loads the remote book, and starts playing.
    func listenHereFromMiniPlayer() {
        guard state.isRemotePlaybackActive,
              let remoteBookId = state.remoteBookId,
              !remoteBookId.isEmpty else { return }

        Task {
            let fallbackTitle = state.remoteTitle ?? "Playback"
            await load(bookId: remoteBookId, title: fallbackTitle)
            playPressed()
        }
    }
}
