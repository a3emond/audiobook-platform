import Foundation

// MARK: - PlaybackPresence

/// Snapshot of a single device's playback state received via WebSocket presence events.
struct PlaybackPresence {
    let deviceId: String
    let label: String
    let currentBookId: String?
    let paused: Bool
    let timestamp: Date
}
