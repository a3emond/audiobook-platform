import Foundation
import MediaPlayer

/// Protocol for managing remote media controls (lock screen, media center, headphone buttons, etc).
/// Handles MPRemoteCommandCenter registration, now playing information, and artwork management.
protocol RemoteCommandsAdapter: AnyObject {
    /// Configure remote command center with play, pause, skip, and chapter navigation.
    /// Should be idempotent - safe to call multiple times.
    func configureRemoteCommandsIfNeeded()

    /// Remove all registered remote command targets and clean up resources.
    func removeRemoteCommandTargets()

    /// Update the now playing information displayed on lock screen and media controls.
    /// This includes title, artist, artwork, and playback progress.
    func updateNowPlayingInfo(
        title: String,
        author: String?,
        duration: TimeInterval,
        position: TimeInterval,
        playbackRate: Double,
        isPlaying: Bool,
        coverURL: String?,
        chapterTitle: String?,
        chapterNumber: Int?,
        forwardJumpSeconds: Double,
        backwardJumpSeconds: Double
    )

    /// Clear the now playing information from media center.
    func clearNowPlayingInfo()

    /// Update the artwork displayed in lock screen and media controls.
    func updateNowPlayingArtwork(_ artwork: MPMediaItemArtwork)
}
