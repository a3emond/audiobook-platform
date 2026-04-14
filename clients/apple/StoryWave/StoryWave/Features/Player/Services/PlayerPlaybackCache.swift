import Foundation
import AudiobookCore

// MARK: - PlayerPlaybackCache

/// In-memory TTL cache for player-owned API responses.
/// Reduces redundant `settings` and `playbackDetails` calls across book loads within a session.
@MainActor
final class PlayerPlaybackCache {

    // MARK: TTL Constants

    private let settingsTTL: TimeInterval       = 120  // 2 minutes
    private let playbackDetailsTTL: TimeInterval = 300  // 5 minutes

    // MARK: Cached Entries

    private var settingsEntry: (timestamp: Date, value: SettingsDTO)?
    private var playbackDetailsEntries: [String: (timestamp: Date, value: PlaybackDetailsDTO)] = [:]

    // MARK: Settings

    /// Returns cached settings within the TTL window; otherwise fetches and caches fresh data.
    func fetchSettings(using repository: PlayerRepository) async throws -> SettingsDTO {
        if let entry = settingsEntry, !entry.timestamp.isExpired(ttl: settingsTTL) {
            return entry.value
        }
        let fresh = try await repository.fetchSettings()
        settingsEntry = (Date(), fresh)
        return fresh
    }

    // MARK: Playback Details

    /// Returns cached playback details for `bookId` within the TTL window; otherwise fetches and caches.
    func fetchPlaybackDetails(bookId: String, using repository: PlayerRepository) async throws -> PlaybackDetailsDTO {
        if let entry = playbackDetailsEntries[bookId], !entry.timestamp.isExpired(ttl: playbackDetailsTTL) {
            return entry.value
        }
        let fresh = try await repository.fetchPlaybackDetails(bookId: bookId)
        playbackDetailsEntries[bookId] = (Date(), fresh)
        return fresh
    }

    // MARK: Invalidation

    /// Evicts cached playback details for a specific book (e.g., after an admin metadata edit).
    func invalidateBook(_ bookId: String) {
        playbackDetailsEntries.removeValue(forKey: bookId)
    }

    /// Evicts all cached entries.
    func invalidateAll() {
        settingsEntry = nil
        playbackDetailsEntries.removeAll()
    }
}

// MARK: - Date TTL Helper

private extension Date {
    /// Returns `true` when more than `ttl` seconds have elapsed since this date.
    func isExpired(ttl: TimeInterval) -> Bool {
        Date().timeIntervalSince(self) > ttl
    }
}
