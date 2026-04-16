import Foundation
import AudiobookCore

/*
 Purpose:
 Immutable-ish computed state helpers for Library screens.

 Notes:
 - Holds sorting/filtering logic used by multiple Library views.
 - Uses LibraryProgressMath for consistent progress math across surfaces.
*/
struct SeriesProgressSnapshot: Equatable {
    let progressPercent: Double?
    let completedBooksCount: Int
    let startedBooksCount: Int
    let totalBooksCount: Int
}

struct LibraryViewState {
    private static let standaloneSeriesName = "Standalone"

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
        let bestProgress = progressMapByBookId()

        return bestProgress.values
            .filter { !$0.completed && $0.positionSeconds > 0 }
            .compactMap { p -> (BookDTO, ProgressRecordDTO)? in
                guard let book = bookMap[p.bookId] else { return nil }
                return (book, p)
            }
            .sorted {
                let lhsTimestamp = progressTimestamp($0.1)
                let rhsTimestamp = progressTimestamp($1.1)
                if lhsTimestamp != rhsTimestamp {
                    return lhsTimestamp > rhsTimestamp
                }

                if $0.1.positionSeconds != $1.1.positionSeconds {
                    return $0.1.positionSeconds > $1.1.positionSeconds
                }

                return $0.0.id < $1.0.id
            }
            .prefix(20)
            .map { ($0.0, $0.1) }
    }

    var seriesRails: [(name: String, books: [BookDTO])] {
        groupedSeriesRails(
            from: allBooks,
            includeStandalone: false,
            hideTrailingSeriesWhenBooksHasMore: false
        )
    }

    var displayedSearchSeriesRails: [(name: String, books: [BookDTO])] {
        guard !query.isEmpty else { return [] }

        let localMatches = allBooks.filter { matchesQuery($0, query: query) }
        let merged = mergedBooksKeepingFirstOccurrence(searchResults + localMatches)

        return groupedSeriesRails(
            from: merged,
            includeStandalone: true,
            hideTrailingSeriesWhenBooksHasMore: false
        )
    }

    var displayedSearchResultCount: Int {
        displayedSearchSeriesRails.reduce(0) { $0 + $1.books.count }
    }

    func progressRecord(for bookId: String) -> ProgressRecordDTO? {
        progressMapByBookId()[bookId]
    }

    func progressPercent(for bookId: String) -> Double? {
        guard let progress = progressRecord(for: bookId) else { return nil }
        let bookDuration = allBooks.first(where: { $0.id == bookId })?.duration
        return LibraryProgressMath.progressPercent(
            progress: progress,
            bookDurationSeconds: bookDuration,
            zeroDurationBehavior: .startedFallback
        )
    }

    func isCompleted(for bookId: String) -> Bool {
        progressRecord(for: bookId)?.completed == true
    }

    func seriesProgress(for books: [BookDTO]) -> SeriesProgressSnapshot {
        guard !books.isEmpty else {
            return SeriesProgressSnapshot(progressPercent: nil, completedBooksCount: 0, startedBooksCount: 0, totalBooksCount: 0)
        }

        var totalDurationSeconds = 0
        var listenedSeconds = 0
        var completedBooksCount = 0
        var startedBooksCount = 0

        for book in books {
            let progress = progressRecord(for: book.id)
            let savedDurationSeconds = LibraryProgressMath.normalizedDurationSeconds(progress?.durationAtSave)
            let bookDurationSeconds = LibraryProgressMath.normalizedDurationSeconds(book.duration)
            let effectiveDurationSeconds = max(savedDurationSeconds ?? 0, bookDurationSeconds ?? 0)

            if progress?.completed == true {
                completedBooksCount += 1
            }

            if let progress, progress.completed || progress.positionSeconds > 0 {
                startedBooksCount += 1
            }

            if effectiveDurationSeconds > 0 {
                totalDurationSeconds += effectiveDurationSeconds
            }

            guard let progress else {
                continue
            }

            if progress.completed {
                listenedSeconds += max(effectiveDurationSeconds, savedDurationSeconds ?? 0)
                continue
            }

            let positionSeconds = LibraryProgressMath.normalizedDurationSeconds(progress.positionSeconds) ?? 0
            let maxTrackableDuration = max(effectiveDurationSeconds, savedDurationSeconds ?? 0)
            listenedSeconds += min(max(positionSeconds, 0), maxTrackableDuration)
        }

        let progressPercent: Double?
        if startedBooksCount == 0 {
            progressPercent = nil
        } else if totalDurationSeconds > 0 {
            progressPercent = min(1, max(0, Double(listenedSeconds) / Double(totalDurationSeconds)))
        } else if completedBooksCount > 0 {
            progressPercent = Double(completedBooksCount) / Double(max(books.count, 1))
        } else {
            progressPercent = LibraryProgressMath.startedFallbackPercent
        }

        return SeriesProgressSnapshot(
            progressPercent: progressPercent,
            completedBooksCount: completedBooksCount,
            startedBooksCount: startedBooksCount,
            totalBooksCount: books.count
        )
    }

    private func progressMapByBookId() -> [String: ProgressRecordDTO] {
        var map: [String: ProgressRecordDTO] = [:]
        for record in allProgress {
            if let existing = map[record.bookId] {
                // Prefer the freshest activity timestamp to keep active-book overlays and ordering accurate.
                if progressTimestamp(record) >= progressTimestamp(existing) {
                    map[record.bookId] = record
                }
            } else {
                map[record.bookId] = record
            }
        }
        return map
    }

    private func progressTimestamp(_ progress: ProgressRecordDTO) -> TimeInterval {
        guard let raw = progress.lastListenedAt ?? progress.updatedAt else {
            return 0
        }

        if let date = Self.progressDateParser.date(from: raw)
            ?? Self.progressDateParserFallback.date(from: raw) {
            return date.timeIntervalSince1970
        }

        return Date(timeIntervalSince1970: 0).timeIntervalSince1970
    }

    private func groupedSeriesRails(
        from books: [BookDTO],
        includeStandalone: Bool,
        hideTrailingSeriesWhenBooksHasMore: Bool
    ) -> [(name: String, books: [BookDTO])] {
        var map: [String: [BookDTO]] = [:]
        var order: [String] = []

        for book in books {
            let normalizedSeries = normalizedSeriesName(for: book, includeStandalone: includeStandalone)
            guard let seriesName = normalizedSeries else { continue }

            if map[seriesName] == nil {
                order.append(seriesName)
                map[seriesName] = []
            }
            map[seriesName]?.append(book)
        }

          if hideTrailingSeriesWhenBooksHasMore,
              !order.isEmpty,
           let trailingSeries = order.last,
           trailingSeries != Self.standaloneSeriesName {
            map.removeValue(forKey: trailingSeries)
            order.removeLast()
        }

        return order.compactMap { seriesName in
            guard let seriesBooks = map[seriesName], !seriesBooks.isEmpty else { return nil }
            return (
                name: seriesName,
                books: seriesBooks.sorted { ($0.seriesIndex ?? 0) < ($1.seriesIndex ?? 0) }
            )
        }
    }

    private func normalizedSeriesName(for book: BookDTO, includeStandalone: Bool) -> String? {
        let trimmedSeries = book.series?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !trimmedSeries.isEmpty {
            return trimmedSeries
        }
        return includeStandalone ? Self.standaloneSeriesName : nil
    }

    private func matchesQuery(_ book: BookDTO, query: String) -> Bool {
        let token = normalizedSearchToken(query)
        guard !token.isEmpty else { return false }

        let searchableFields: [String] = [
            book.title,
            book.author ?? "",
            book.series ?? "",
            book.genre ?? "",
            book.language ?? "",
            book.tags?.joined(separator: " ") ?? "",
            book.description?.defaultText ?? "",
            book.description?.en ?? "",
            book.description?.fr ?? ""
        ]

        return searchableFields.contains { field in
            normalizedSearchToken(field).contains(token)
        }
    }

    private func normalizedSearchToken(_ value: String) -> String {
        value
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private func mergedBooksKeepingFirstOccurrence(_ books: [BookDTO]) -> [BookDTO] {
        var seen = Set<String>()
        var merged: [BookDTO] = []

        for book in books where !seen.contains(book.id) {
            seen.insert(book.id)
            merged.append(book)
        }

        return merged
    }
}
