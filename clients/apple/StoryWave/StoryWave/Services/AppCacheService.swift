import Foundation
import Combine

// MARK: - CacheInvalidationEvent

/// Describes the scope of a cache-invalidation request propagated across the app.
enum CacheInvalidationEvent {
    /// A single book's cached data (metadata, chapters, cover) is stale.
    case book(id: String)
    /// The library snapshot (listing, progress) is stale.
    case library
    /// Everything is stale — use after bulk operations or sign-out.
    case all
}

// MARK: - AppCacheService

/// App-wide cache-invalidation bus.
///
/// ViewModels subscribe to `invalidationPublisher` via Combine and clear their local caches
/// in response.  Call `invalidate*` methods from `AdminViewModel` after any mutation that
/// persists to the server and would render cached data incorrect.
@MainActor
final class AppCacheService {

    // MARK: Publisher

    let invalidationPublisher = PassthroughSubject<CacheInvalidationEvent, Never>()

    // MARK: Invalidation

    /// Announce that a single book's server data (metadata, cover, chapters) has changed.
    func invalidateBook(_ bookId: String) {
        invalidationPublisher.send(.book(id: bookId))
    }

    /// Announce that the library listing or progress snapshot is stale.
    func invalidateLibrary() {
        invalidationPublisher.send(.library)
    }

    /// Announce that all caches across the app should be cleared.
    func invalidateAll() {
        invalidationPublisher.send(.all)
    }
}
