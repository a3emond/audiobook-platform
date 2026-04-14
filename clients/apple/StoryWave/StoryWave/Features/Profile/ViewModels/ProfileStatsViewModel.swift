import Foundation
import AudiobookCore
import Combine

@MainActor
final class ProfileStatsViewModel: ObservableObject {
    @Published private(set) var stats: UserStatsDTO?
    @Published private(set) var sessions: [ListeningSessionDTO] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingMore = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var hasMore = false
    @Published private(set) var bookTitlesById: [String: String] = [:]

    private let repository: StatsRepository
    private let libraryRepository: LibraryRepository
    private let appCacheService: AppCacheService
    private var cancellables = Set<AnyCancellable>()
    private var currentOffset = 0
    private let pageSize = 20
    private var bookTitleCache: [String: (timestamp: Date, title: String)] = [:]
    private let bookTitleCacheTTL: TimeInterval = 600

    init(repository: StatsRepository, libraryRepository: LibraryRepository, appCacheService: AppCacheService) {
        self.repository = repository
        self.libraryRepository = libraryRepository
        self.appCacheService = appCacheService

        appCacheService.invalidationPublisher
            .sink { [weak self] event in
                guard let self else { return }
                switch event {
                case .all:
                    self.bookTitleCache.removeAll()
                    self.bookTitlesById.removeAll()
                case .library:
                    self.bookTitleCache.removeAll()
                case .book(let id):
                    self.bookTitleCache.removeValue(forKey: id)
                    self.bookTitlesById.removeValue(forKey: id)
                }
            }
            .store(in: &cancellables)
    }

    func loadInitial() async {
        isLoading = true
        errorMessage = nil
        currentOffset = 0

        do {
            async let statsTask = repository.getMine()
            async let sessionsTask = repository.listSessions(bookId: nil, limit: pageSize, offset: 0)
            let (statsData, sessionPage) = try await (statsTask, sessionsTask)
            stats = statsData
            sessions = sessionPage.sessions
            hasMore = sessionPage.hasMore
            currentOffset = sessionPage.offset + sessionPage.limit
            await loadBookTitles(for: sessions)
        } catch {
            errorMessage = "Could not load listening stats."
        }

        isLoading = false
    }

    func loadMoreIfNeeded(currentSession: ListeningSessionDTO) async {
        guard hasMore,
              !isLoading,
              !isLoadingMore,
              sessions.last?.id == currentSession.id else {
            return
        }

        isLoadingMore = true

        do {
            let page = try await repository.listSessions(bookId: nil, limit: pageSize, offset: currentOffset)
            sessions.append(contentsOf: page.sessions)
            hasMore = page.hasMore
            currentOffset = page.offset + page.limit
            await loadBookTitles(for: page.sessions)
        } catch {
            errorMessage = "Could not load more history."
        }

        isLoadingMore = false
    }

    func title(for bookId: String) -> String {
        bookTitlesById[bookId] ?? bookId
    }

    private func loadBookTitles(for sessions: [ListeningSessionDTO]) async {
        evictExpiredBookTitleCache()

        var updatedTitles = bookTitlesById
        for bookId in Set(sessions.map(\.bookId)) {
            if let cached = bookTitleCache[bookId] {
                updatedTitles[bookId] = cached.title
            }
        }

        let missingBookIds = Set(sessions.map(\.bookId)).filter { updatedTitles[$0] == nil }
        guard !missingBookIds.isEmpty else {
            bookTitlesById = updatedTitles
            return
        }

        for bookId in missingBookIds {
            do {
                let book = try await libraryRepository.book(id: bookId)
                updatedTitles[bookId] = book.title
                bookTitleCache[bookId] = (Date(), book.title)
            } catch {
                updatedTitles[bookId] = bookId
                bookTitleCache[bookId] = (Date(), bookId)
            }
        }
        bookTitlesById = updatedTitles
    }

    private func evictExpiredBookTitleCache() {
        let now = Date()
        bookTitleCache = bookTitleCache.filter { now.timeIntervalSince($0.value.timestamp) <= bookTitleCacheTTL }
    }

    func reset() {
        stats = nil
        sessions = []
        bookTitlesById = [:]
        isLoading = false
        isLoadingMore = false
        errorMessage = nil
        hasMore = false
        currentOffset = 0
        bookTitleCache.removeAll()
    }
}
