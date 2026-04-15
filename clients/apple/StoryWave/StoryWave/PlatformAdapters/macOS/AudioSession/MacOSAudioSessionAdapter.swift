import Foundation

/// Implementation of AudioSessionAdapter for macOS.
/// Configures AVAudioSession for audiobook playback on macOS.
@MainActor
final class MacOSAudioSessionAdapter: AudioSessionAdapter {
    weak var interruptionHandler: AudioSessionInterruptionHandler?

    init(interruptionHandler: AudioSessionInterruptionHandler? = nil) {
        self.interruptionHandler = interruptionHandler
    }

    // MARK: AudioSessionAdapter

    func configureForPlayback() {
        // macOS does not expose AVAudioSession APIs used on iOS.
        // Audio routing and session behavior are managed by AppKit/AVFoundation playback objects.
    }

    func handleAudioInterruption(of type: AudioSessionInterruptionType) -> Bool {
        switch type {
        case .began:
            interruptionHandler?.audioSessionWasInterrupted()
            return false

        case .ended:
            interruptionHandler?.audioSessionInterruptionEnded()
            return true
        }
    }

    func cleanup() {
        // No explicit session cleanup required on macOS.
    }
}
