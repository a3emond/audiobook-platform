import Foundation
import AudiobookCore

struct SeriesProgressSnapshot: Equatable {
    let progressPercent: Double?
    let completedBooksCount: Int
    let startedBooksCount: Int
    let totalBooksCount: Int
}

private let startedProgressFallbackPercent: Double = 0.01

struct LibraryViewState {
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
        progressMapByBookId()[bookId]
    }

    func progressPercent(for bookId: String) -> Double? {
        guard let progress = progressRecord(for: bookId) else { return nil }

        if progress.completed {
            return 1
        }

        let progressDuration = normalizedDurationSeconds(progress.durationAtSave)
        let bookDuration = normalizedDurationSeconds(allBooks.first(where: { $0.id == bookId })?.duration)
        let duration = max(progressDuration ?? 0, bookDuration ?? 0)
        if duration <= 0 {
            return progress.positionSeconds > 0 ? startedProgressFallbackPercent : nil
        }

        let position = normalizedDurationSeconds(progress.positionSeconds) ?? 0
        return min(1, max(0, Double(position) / Double(duration)))
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
            let savedDurationSeconds = normalizedDurationSeconds(progress?.durationAtSave)
            let bookDurationSeconds = normalizedDurationSeconds(book.duration)
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

            let positionSeconds = normalizedDurationSeconds(progress.positionSeconds) ?? 0
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
            progressPercent = startedProgressFallbackPercent
        }

        return SeriesProgressSnapshot(
            progressPercent: progressPercent,
            completedBooksCount: completedBooksCount,
            startedBooksCount: startedBooksCount,
            totalBooksCount: books.count
        )
    }

    private func normalizedDurationSeconds(_ rawValue: Int?) -> Int? {
        guard let rawValue, rawValue > 0 else { return nil }
        if rawValue > 200_000 {
            return max(1, rawValue / 1000)
        }
        return rawValue
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
}
