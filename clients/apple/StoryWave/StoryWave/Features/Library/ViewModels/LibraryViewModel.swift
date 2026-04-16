import Foundation
import AudiobookCore
import Combine

@MainActor
final class LibraryViewModel: ObservableObject {
    private static let progressDateParser: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let progressDateParserFallback: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
    private let progressDebugEnabled = true

    // MARK: Published State

    @Published private(set) var state = LibraryViewState()

    // MARK: Dependencies

    private let repository: LibraryRepository
    private let apiClient: APIClient
    private let authService: AuthService
    private let appCacheService: AppCacheService
    private let progressRepository: ProgressRepository
    private let localization = LocalizationService.shared

    // MARK: Runtime State

    private var searchTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    // MARK: Constants

    private let initialBooksLimit = 60
    private let booksPageSize = 60
    private let collectionsPageSize = 24
    private let progressPageSize = 100
    private let maxProgressPages = 10
    private let cacheTTL: TimeInterval = 90
    private let progressRefreshTTL: TimeInterval = 12

    // MARK: Caches

    private var snapshotCache: LibrarySnapshotCache?
    private var searchCache: [String: (timestamp: Date, books: [BookDTO])] = [:]
    private var bookDetailsCache: [String: BookDTO] = [:]
    private var lastProgressRefreshAt: Date?

    private struct LibrarySnapshotCache {
        let books: [BookDTO]
        let collections: [CollectionDTO]
        let progress: [ProgressRecordDTO]
        let booksOffset: Int
        let booksHasMore: Bool
        let collectionsOffset: Int
        let collectionsHasMore: Bool
        let timestamp: Date
    }

    // MARK: Init

    init(repository: LibraryRepository, apiClient: APIClient, authService: AuthService, appCacheService: AppCacheService) {
        self.repository = repository
        self.apiClient = apiClient
        self.authService = authService
        self.appCacheService = appCacheService
        self.progressRepository = ProgressRepositoryImpl(authService: authService)

        appCacheService.invalidationPublisher
            .sink { [weak self] event in
                guard let self else { return }
                switch event {
                case .all, .library:
                    self.snapshotCache = nil
                    self.searchCache.removeAll()
                    self.bookDetailsCache.removeAll()
                    Task { await self.refreshProgressIfNeeded(force: true) }
                case .book(let id):
                    self.bookDetailsCache.removeValue(forKey: id)
                    self.snapshotCache = nil
                }
            }
            .store(in: &cancellables)
    }

            // MARK: Cover URLs

    func coverURL(for book: BookDTO) -> URL? {
        guard book.coverPath != nil else { return nil }
        guard let token = authService.accessToken else { return nil }
        let base = apiClient.makeURL(path: "streaming/books/\(book.id)/cover")
        var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
        let encodedToken = token.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? token
        components?.percentEncodedQuery = "access_token=\(encodedToken)"
        return components?.url
    }

    func coverURL(for bookId: String) -> URL? {
        guard let book = state.allBooks.first(where: { $0.id == bookId }) else { return nil }
        return coverURL(for: book)
    }

    // MARK: Progress

    func progressPercent(for bookId: String) -> Double? {
        state.progressPercent(for: bookId)
    }

    func debugProgressSnapshot(for bookId: String, source: String) {
        guard progressDebugEnabled else { return }

        let progress = state.progressRecord(for: bookId)
        let percent = state.progressPercent(for: bookId)
        let activeBook = state.allBooks.first(where: { $0.id == bookId })
        let continueItems = state.continueListeningItems
        let continueIndex = continueItems.firstIndex(where: { $0.book.id == bookId })
        let continuePreview = continueItems.prefix(5).map {
            "\($0.book.id.prefix(8)):\($0.progress.positionSeconds)@\($0.progress.lastListenedAt ?? $0.progress.updatedAt ?? "nil")"
        }.joined(separator: ",")
        let normalizedTitle = normalizeDebugTitle(activeBook?.title)
        let titlePeerBooks = state.allBooks.filter { normalizeDebugTitle($0.title) == normalizedTitle }
        let titlePeerPreview = titlePeerBooks.prefix(6).map { peer in
            let peerProgress = state.progressRecord(for: peer.id)
            let peerPercent = state.progressPercent(for: peer.id)
            let peerPercentText = peerPercent.map { String(format: "%.3f", $0) } ?? "nil"
            let peerTimestamp = peerProgress?.lastListenedAt ?? peerProgress?.updatedAt ?? "nil"
            return "\(peer.id.prefix(8))|p=\(peerProgress?.positionSeconds ?? -1)|pct=\(peerPercentText)|ts=\(peerTimestamp)"
        }.joined(separator: ",")
        let recordLast = progress?.lastListenedAt ?? "nil"
        let percentText = percent.map { String(format: "%.4f", $0) } ?? "nil"
        let continueIndexText = continueIndex.map(String.init) ?? "nil"

        print(
            "[ProgressDebug][Library][\(source)] " +
            "bookId=\(bookId) " +
            "title=\(activeBook?.title ?? "<missing>") " +
            "recordPos=\(progress?.positionSeconds ?? -1) " +
            "recordDuration=\(progress?.durationAtSave ?? -1) " +
            "recordCompleted=\(progress?.completed ?? false) " +
            "recordLast=\(recordLast) " +
            "percent=\(percentText) " +
            "continueIndex=\(continueIndexText) " +
            "continueCount=\(continueItems.count) " +
            "continueTop5=\(continuePreview) " +
            "titlePeerCount=\(titlePeerBooks.count) " +
            "titlePeers=\(titlePeerPreview)"
        )
    }

    func isCompleted(for bookId: String) -> Bool {
        state.isCompleted(for: bookId)
    }

    func seriesProgress(for books: [BookDTO]) -> SeriesProgressSnapshot {
        state.seriesProgress(for: books)
    }

    func loadLibrary(forceRefresh: Bool = false) async {
        if !forceRefresh, let snapshot = snapshotCache, Date().timeIntervalSince(snapshot.timestamp) <= cacheTTL {
            applySnapshot(snapshot)
            await refreshProgressIfNeeded()
            return
        }

        state.isLoading = true
        state.errorMessage = nil
        do {
            async let booksTask = repository.listBooks(
                language: localization.locale,
                query: nil,
                limit: initialBooksLimit,
                offset: 0
            )
            async let collectionsTask = repository.listCollections(limit: collectionsPageSize, offset: 0)
            let (booksPage, collectionsPage) = try await (booksTask, collectionsTask)

            state.allBooks = booksPage.books
            state.collections = collectionsPage.collections
            state.booksOffset = booksPage.books.count
            state.booksHasMore = state.booksOffset < booksPage.total
            state.collectionsOffset = collectionsPage.collections.count
            state.collectionsHasMore = state.collectionsOffset < collectionsPage.total

            if let progress = try? await fetchProgressSnapshot() {
                state.allProgress = progress
                lastProgressRefreshAt = Date()
            } else if state.allProgress.isEmpty,
                      let fallbackPage = try? await progressRepository.listMine(limit: 50, offset: 0) {
                state.allProgress = deduplicatedProgress(fallbackPage.progress)
                lastProgressRefreshAt = Date()
            }

            await hydrateContinueListeningBooks()

            for book in booksPage.books {
                bookDetailsCache[book.id] = book
            }
            refreshSnapshotCache()
        } catch {
            do {
                let page = try await repository.listBooks(
                    language: localization.locale,
                    query: nil,
                    limit: initialBooksLimit,
                    offset: 0
                )
                state.allBooks = page.books
                state.booksOffset = page.books.count
                state.booksHasMore = state.booksOffset < page.total
            } catch {
                state.errorMessage = "Could not load library."
            }
            do {
                let page = try await repository.listCollections(limit: collectionsPageSize, offset: 0)
                state.collections = page.collections
                state.collectionsOffset = page.collections.count
                state.collectionsHasMore = state.collectionsOffset < page.total
            } catch {}

            if let progress = try? await fetchProgressSnapshot() {
                state.allProgress = progress
                lastProgressRefreshAt = Date()
            } else if state.allProgress.isEmpty,
                      let fallbackPage = try? await progressRepository.listMine(limit: 50, offset: 0) {
                state.allProgress = deduplicatedProgress(fallbackPage.progress)
                lastProgressRefreshAt = Date()
            }

            await hydrateContinueListeningBooks()

            for book in state.allBooks {
                bookDetailsCache[book.id] = book
            }
            refreshSnapshotCache()
        }
        state.isLoading = false
    }

    func loadMoreBooks() async {
        guard !state.isLoadingMoreBooks,
              !state.isLoading,
              state.booksHasMore,
              state.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            return
        }

        state.isLoadingMoreBooks = true
        defer { state.isLoadingMoreBooks = false }

        do {
            let page = try await repository.listBooks(
                language: localization.locale,
                query: nil,
                limit: booksPageSize,
                offset: state.booksOffset
            )

            let merged = mergedBooks(current: state.allBooks, incoming: page.books)
            state.allBooks = merged
            state.booksOffset += page.books.count
            state.booksHasMore = state.booksOffset < page.total

            for book in page.books {
                bookDetailsCache[book.id] = book
            }
            refreshSnapshotCache()
        } catch {
            state.errorMessage = "Could not load more books."
        }
    }

    func loadMoreCollections() async {
        guard !state.isLoadingMoreCollections,
              !state.isLoading,
              state.collectionsHasMore,
              state.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            return
        }

        state.isLoadingMoreCollections = true
        defer { state.isLoadingMoreCollections = false }

        do {
            let page = try await repository.listCollections(
                limit: collectionsPageSize,
                offset: state.collectionsOffset
            )

            state.collections += page.collections
            state.collectionsOffset += page.collections.count
            state.collectionsHasMore = state.collectionsOffset < page.total
            refreshSnapshotCache()
        } catch {
            state.errorMessage = "Could not load more collections."
        }
    }

    func updateQuery(_ query: String) {
        state.query = query
        state.searchResults = []
        searchTask?.cancel()
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled, let self else { return }
            await self.searchBooks()
        }
    }

    private func searchBooks() async {
        let normalizedQuery = state.query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedQuery.isEmpty else {
            state.searchResults = []
            return
        }

        let cacheKey = "\(localization.locale.lowercased())::\(normalizedQuery.lowercased())"
        if let cached = searchCache[cacheKey], Date().timeIntervalSince(cached.timestamp) <= cacheTTL {
            state.searchResults = cached.books
            return
        }

        do {
            let page = try await repository.listBooks(
                language: localization.locale,
                query: normalizedQuery,
                limit: 100,
                offset: 0
            )
            state.searchResults = page.books
            searchCache[cacheKey] = (Date(), page.books)
        } catch {}
    }

    func showSeriesDetail(name: String) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        state.isLoading = true
        defer { state.isLoading = false }

        do {
            let detail = try await repository.seriesDetail(name: trimmed, language: localization.locale)
            let sorted = detail.books.sorted { ($0.seriesIndex ?? 0) < ($1.seriesIndex ?? 0) }

            state.selectedSeriesName = detail.name
            state.selectedSeriesBooks = sorted
            state.errorMessage = nil

            for book in sorted {
                bookDetailsCache[book.id] = book
            }
            refreshSnapshotCache()
        } catch {
            state.selectedSeriesName = nil
            state.selectedSeriesBooks = []
            state.errorMessage = "Could not load series details."
        }
    }

    func clearSeriesDetail() {
        state.selectedSeriesName = nil
        state.selectedSeriesBooks = []
    }

    func loadCollectionDetail(_ collection: CollectionDTO) async {
        let localMap = Dictionary(uniqueKeysWithValues: state.allBooks.map { ($0.id, $0) })
        if collection.bookIds.isEmpty {
            state.selectedCollectionName = collection.name
            state.selectedCollectionBooks = []
            return
        }

        var resolvedMap = localMap
        for (id, cached) in bookDetailsCache {
            resolvedMap[id] = cached
        }

        let missingIds = collection.bookIds.filter { resolvedMap[$0] == nil }
        if missingIds.isEmpty {
            state.selectedCollectionName = collection.name
            state.selectedCollectionBooks = collection.bookIds.compactMap { resolvedMap[$0] }
            return
        }

        state.isLoading = true
        defer { state.isLoading = false }

        for bookId in missingIds {
            if let fetched = try? await repository.book(id: bookId) {
                bookDetailsCache[bookId] = fetched
                resolvedMap[bookId] = fetched
            }
        }

        state.selectedCollectionName = collection.name
        state.selectedCollectionBooks = collection.bookIds.compactMap { resolvedMap[$0] }
    }

    func clearCollectionDetail() {
        state.selectedCollectionName = nil
        state.selectedCollectionBooks = []
    }

    func reset() {
        state = LibraryViewState()
        snapshotCache = nil
        searchCache.removeAll()
        bookDetailsCache.removeAll()
        lastProgressRefreshAt = nil
    }

    func applyRealtimeProgressSync(
        bookId: String,
        positionSeconds: Int?,
        durationAtSave: Int?,
        completed: Bool?,
        timestamp: String?
    ) async {
        guard !bookId.isEmpty else { return }

        let safePosition = max(positionSeconds ?? 0, 0)
        let safeDuration = max(durationAtSave ?? 0, 0)
        let eventTimestamp = timestamp

        if let existingIndex = state.allProgress.firstIndex(where: { $0.bookId == bookId }) {
            let existing = state.allProgress[existingIndex]
            let merged = ProgressRecordDTO(
                bookId: existing.bookId,
                positionSeconds: positionSeconds ?? existing.positionSeconds,
                durationAtSave: safeDuration > 0 ? safeDuration : existing.durationAtSave,
                completed: completed ?? existing.completed,
                lastListenedAt: eventTimestamp ?? existing.lastListenedAt ?? existing.updatedAt,
                updatedAt: eventTimestamp ?? existing.updatedAt ?? existing.lastListenedAt
            )

            // Avoid extra view churn when no effective data changed.
            if merged.positionSeconds != existing.positionSeconds ||
               merged.durationAtSave != existing.durationAtSave ||
               merged.completed != existing.completed ||
               merged.lastListenedAt != existing.lastListenedAt ||
               merged.updatedAt != existing.updatedAt {
                state.allProgress[existingIndex] = merged
            }
        } else {
            let record = ProgressRecordDTO(
                bookId: bookId,
                positionSeconds: safePosition,
                durationAtSave: safeDuration,
                completed: completed ?? false,
                lastListenedAt: eventTimestamp,
                updatedAt: eventTimestamp
            )
            state.allProgress.append(record)
        }

        state.allProgress = deduplicatedProgress(state.allProgress)
        lastProgressRefreshAt = Date()
        await hydrateContinueListeningBooks(maxFetch: 1)

        if progressDebugEnabled {
            debugProgressSnapshot(for: bookId, source: "applyRealtimeProgressSync")
        }
    }

    private func refreshProgressIfNeeded(force: Bool = false) async {
        if !force,
           let lastProgressRefreshAt,
           Date().timeIntervalSince(lastProgressRefreshAt) <= progressRefreshTTL {
            return
        }

        guard let progress = try? await fetchProgressSnapshot() else {
            return
        }

        state.allProgress = progress
        lastProgressRefreshAt = Date()
        await hydrateContinueListeningBooks()
    }

    private func fetchProgressSnapshot() async throws -> [ProgressRecordDTO] {
        var offset = 0
        var pageCount = 0
        var collected: [ProgressRecordDTO] = []

        while pageCount < maxProgressPages {
            let page = try await progressRepository.listMine(limit: progressPageSize, offset: offset)
            collected.append(contentsOf: page.progress)
            pageCount += 1

            if !page.hasMore || page.progress.isEmpty {
                break
            }

            offset = page.offset + page.limit
        }

        if collected.isEmpty {
            let fallbackPage = try await progressRepository.listMine(limit: 50, offset: 0)
            return deduplicatedProgress(fallbackPage.progress)
        }

        return deduplicatedProgress(collected)
    }

    private func deduplicatedProgress(_ progress: [ProgressRecordDTO]) -> [ProgressRecordDTO] {
        var deduped: [String: ProgressRecordDTO] = [:]
        for record in progress {
            if let existing = deduped[record.bookId] {
                let recordTimestamp = progressTimestamp(record)
                let existingTimestamp = progressTimestamp(existing)
                if recordTimestamp > existingTimestamp ||
                    (recordTimestamp == existingTimestamp && record.positionSeconds >= existing.positionSeconds) {
                    deduped[record.bookId] = record
                }
            } else {
                deduped[record.bookId] = record
            }
        }
        return Array(deduped.values)
    }

    private func hydrateContinueListeningBooks(maxFetch: Int = 8) async {
        var existingIds = Set(state.allBooks.map(\.id))
        let candidateIds = state.allProgress
            .filter { !$0.completed && $0.positionSeconds > 0 }
            .sorted { progressTimestamp($0) > progressTimestamp($1) }
            .map(\.bookId)

        // Re-inject known books that were previously cached but are currently absent from the
        // rendered catalog list. Without this, a realtime-updated active book can have progress
        // data but still be "missing" from card surfaces.
        var reinjectedCount = 0
        for bookId in candidateIds {
            guard !existingIds.contains(bookId), let cached = bookDetailsCache[bookId] else {
                continue
            }

            state.allBooks.append(cached)
            existingIds.insert(bookId)
            reinjectedCount += 1

            if reinjectedCount >= maxFetch {
                break
            }
        }

        let missingIds = candidateIds.filter { id in
            !existingIds.contains(id) && bookDetailsCache[id] == nil
        }

        guard !missingIds.isEmpty else { return }

        for bookId in missingIds.prefix(maxFetch) {
            if let book = try? await repository.book(id: bookId) {
                bookDetailsCache[book.id] = book
                if !state.allBooks.contains(where: { $0.id == book.id }) {
                    state.allBooks.append(book)
                    existingIds.insert(book.id)
                }
            }
        }
    }

    private func progressTimestamp(_ progress: ProgressRecordDTO) -> TimeInterval {
        guard let raw = progress.lastListenedAt ?? progress.updatedAt else {
            return 0
        }

        if let date = Self.progressDateParser.date(from: raw)
            ?? Self.progressDateParserFallback.date(from: raw) {
            return date.timeIntervalSince1970
        }

        return 0
    }

    private func normalizeDebugTitle(_ title: String?) -> String {
        guard let title else { return "" }
        return title
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private func mergedBooks(current: [BookDTO], incoming: [BookDTO]) -> [BookDTO] {
        var byId = Dictionary(uniqueKeysWithValues: current.map { ($0.id, $0) })
        for book in incoming {
            byId[book.id] = book
        }

        var ordered: [BookDTO] = current
        let existing = Set(current.map(\.id))
        let appended = incoming.filter { !existing.contains($0.id) }
        ordered.append(contentsOf: appended)

        return ordered.map { byId[$0.id] ?? $0 }
    }

    private func refreshSnapshotCache() {
        snapshotCache = LibrarySnapshotCache(
            books: state.allBooks,
            collections: state.collections,
            progress: state.allProgress,
            booksOffset: state.booksOffset,
            booksHasMore: state.booksHasMore,
            collectionsOffset: state.collectionsOffset,
            collectionsHasMore: state.collectionsHasMore,
            timestamp: Date()
        )
    }

    private func applySnapshot(_ snapshot: LibrarySnapshotCache) {
        state.allBooks = snapshot.books
        state.collections = snapshot.collections
        state.allProgress = snapshot.progress
        state.booksOffset = snapshot.booksOffset
        state.booksHasMore = snapshot.booksHasMore
        state.collectionsOffset = snapshot.collectionsOffset
        state.collectionsHasMore = snapshot.collectionsHasMore

        for book in snapshot.books {
            bookDetailsCache[book.id] = book
        }
    }
}
