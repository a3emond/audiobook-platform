import Foundation
import AudiobookCore

struct LibraryViewState {
    var query: String = ""
    var allBooks: [BookDTO] = []
    var collections: [CollectionDTO] = []
    var allProgress: [ProgressRecordDTO] = []
    var searchResults: [BookDTO] = []
    var isLoading: Bool = false
    var isLoadingMoreBooks: Bool = false
    var isLoadingMoreCollections: Bool = false
    var errorMessage: String? = nil
    var booksOffset: Int = 0
    var booksHasMore: Bool = false
    var collectionsOffset: Int = 0
    var collectionsHasMore: Bool = false
    var selectedSeriesName: String? = nil
    var selectedSeriesBooks: [BookDTO] = []
    var selectedCollectionName: String? = nil
    var selectedCollectionBooks: [BookDTO] = []

    var latestBooks: [BookDTO] { Array(allBooks.prefix(20)) }

    /// In-progress books (not completed, position > 0) sorted by last listen time.
    var continueListeningItems: [(book: BookDTO, progress: ProgressRecordDTO)] {
        let bookMap = Dictionary(uniqueKeysWithValues: allBooks.map { ($0.id, $0) })
        return allProgress
            .filter { !$0.completed && $0.positionSeconds > 0 }
            .compactMap { p -> (BookDTO, ProgressRecordDTO)? in
                guard let book = bookMap[p.bookId] else { return nil }
                return (book, p)
            }
            .sorted {
                ($0.1.lastListenedAt ?? "") > ($1.1.lastListenedAt ?? "")
            }
            .prefix(20)
            .map { ($0.0, $0.1) }
    }

    var seriesRails: [(name: String, books: [BookDTO])] {
        var map: [String: [BookDTO]] = [:]
        var order: [String] = []
        for book in allBooks {
            guard let s = book.series, !s.isEmpty else { continue }
            if map[s] == nil { order.append(s); map[s] = [] }
            map[s]!.append(book)
        }
        return order.map {
            (name: $0, books: map[$0]!.sorted { ($0.seriesIndex ?? 0) < ($1.seriesIndex ?? 0) })
        }
    }

    var displayedSearchResults: [BookDTO] {
        guard !query.isEmpty else { return [] }
        if !searchResults.isEmpty { return searchResults }
        let q = query.lowercased()
        return allBooks.filter {
            $0.title.lowercased().contains(q) || ($0.author?.lowercased().contains(q) ?? false)
        }
    }

    func progressRecord(for bookId: String) -> ProgressRecordDTO? {
        allProgress.first(where: { $0.bookId == bookId })
    }

    func progressPercent(for bookId: String) -> Double? {
        guard let progress = progressRecord(for: bookId), progress.durationAtSave > 0 else { return nil }
        return min(1, max(0, Double(progress.positionSeconds) / Double(progress.durationAtSave)))
    }
}
