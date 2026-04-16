import Foundation
import MediaPlayer
import AudiobookCore

// MARK: - Media Center (NowPlaying + Remote Commands)

extension PlayerViewModel {

    // MARK: Now Playing Info

    func updateNowPlayingInfo() {
        guard !state.bookId.isEmpty else {
            remoteCommandsAdapter.clearNowPlayingInfo()
            return
        }

        let chapter = state.chapters[safe: state.currentChapterIndex]
        let chapterNumber = chapter.map { $0.index + 1 }

        remoteCommandsAdapter.updateNowPlayingInfo(
            title: state.title,
            author: state.author,
            duration: max(state.durationSeconds, 0),
            position: state.positionSeconds,
            playbackRate: state.playbackRate,
            isPlaying: state.isPlaying,
            coverURL: state.bookId,
            chapterTitle: chapter?.title,
            chapterNumber: chapterNumber,
            forwardJumpSeconds: state.forwardJumpSeconds,
            backwardJumpSeconds: state.backwardJumpSeconds
        )
    }

    func clearNowPlayingInfo() {
        remoteCommandsAdapter.clearNowPlayingInfo()
    }
}

// MARK: - Remote Command Actions

extension PlayerViewModel: PlayerRemoteCommandActions {
    // Empty conformance to PlayerRemoteCommandActions protocol
    // These methods already exist and are called by the remoteCommandsAdapter
}

// MARK: - Audio Session Interruption Handling

extension PlayerViewModel: AudioSessionInterruptionHandler {
    func audioSessionWasInterrupted() {
        pausePressed()
    }

    func audioSessionInterruptionEnded() {
        playPressed()
    }

    func audioHeadphonesDisconnected() {
        pausePressed()
    }
}
