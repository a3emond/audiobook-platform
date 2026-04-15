import Foundation

enum AudioSessionInterruptionType {
    case began
    case ended
}

/// Protocol for platform-specific audio session configuration and lifecycle management.
/// Handles AVAudioSession setup, interruption handling, and platform-specific audio focus.
protocol AudioSessionAdapter {
    /// Configure audio session for playback.
    /// Sets category, mode, and options appropriate for audiobook playback.
    func configureForPlayback()

    /// Handle audio interruption (incoming call, alarm, etc).
    /// Returns true if audio should resume automatically, false if manual intervention is needed.
    func handleAudioInterruption(of type: AudioSessionInterruptionType) -> Bool

    /// Cleanup audio session resources when player is deallocated.
    func cleanup()
}

/// Handler for audio-session lifecycle events.
@MainActor
protocol AudioSessionInterruptionHandler: AnyObject {
    func audioSessionWasInterrupted()
    func audioSessionInterruptionEnded()
    func audioHeadphonesDisconnected()
}
