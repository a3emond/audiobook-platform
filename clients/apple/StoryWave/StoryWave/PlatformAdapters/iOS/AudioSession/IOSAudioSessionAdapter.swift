import Foundation
import AVFoundation

#if os(iOS)

/// Implementation of AudioSessionAdapter for iOS.
/// Configures AVAudioSession for audiobook playback with proper interruption handling.
@MainActor
final class IOSAudioSessionAdapter: AudioSessionAdapter {
    weak var interruptionHandler: AudioSessionInterruptionHandler?

    init(interruptionHandler: AudioSessionInterruptionHandler? = nil) {
        self.interruptionHandler = interruptionHandler
        setupInterruptionNotifications()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: AudioSessionAdapter

    func configureForPlayback() {
        let session = AVAudioSession.sharedInstance()

        do {
            // Use .playback category to ensure audio continues when silent mode is on
            // and to enable audio ducking for external interruptions
            try session.setCategory(
                .playback,
                mode: .default,
                options: [.duckOthers]
            )

            // Activate the session
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            print("Failed to configure AVAudioSession: \(error)")
        }
    }

    func handleAudioInterruption(of type: AudioSessionInterruptionType) -> Bool {
        switch type {
        case .began:
            // Audio interrupted (call, alarm, etc)
            // Signal the view model to pause playback
            interruptionHandler?.audioSessionWasInterrupted()
            return false

        case .ended:
            // Interruption ended - check if we should resume
            let session = AVAudioSession.sharedInstance()
            let shouldResume = session.currentRoute.outputs.contains { output in
                [.headphones, .builtInSpeaker].contains(output.portType)
            }

            if shouldResume {
                interruptionHandler?.audioSessionInterruptionEnded()
            }

            return shouldResume
        }
    }

    func cleanup() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            print("Failed to cleanup AVAudioSession: \(error)")
        }
    }

    // MARK: Private – Notifications

    private func setupInterruptionNotifications() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAudioSessionInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance()
        )
    }

    @objc
    private func handleAudioSessionInterruption(_ notification: Notification) {
        guard let userInfo = notification.userInfo else {
            return
        }

        let typeRaw = (userInfo[AVAudioSessionInterruptionTypeKey] as? UInt)
            ?? (userInfo[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue

        guard let typeRaw,
            let rawType = AVAudioSession.InterruptionType(rawValue: typeRaw) else {
            return
        }

        let type: AudioSessionInterruptionType = rawType == .began ? .began : .ended

        _ = handleAudioInterruption(of: type)
    }

    @objc
    private func handleRouteChange(_ notification: Notification) {
        // Handle headphone disconnect or other route changes
        let session = AVAudioSession.sharedInstance()
        let currentOutputs = session.currentRoute.outputs.map(\.portType)

        // If headphones were disconnected, pause playback
        if !currentOutputs.contains(.headphones) {
            interruptionHandler?.audioHeadphonesDisconnected()
        }
    }
}

#endif
