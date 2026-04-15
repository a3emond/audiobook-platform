import Foundation

public struct ResumeInfoDTO: Decodable {
    public let bookId: String
    public let streamPath: String
    public let positionSeconds: Double
    public let startSeconds: Double
    public let durationSeconds: Double
    public let canResume: Bool
    public let appliedRewind: Bool
}

public struct SaveProgressRequestDTO: Encodable {
    public let positionSeconds: Int
    public let durationAtSave: Int
    public let lastChapterIndex: Int?
    public let secondsIntoChapter: Int?

    public init(
        positionSeconds: Int,
        durationAtSave: Int,
        lastChapterIndex: Int? = nil,
        secondsIntoChapter: Int? = nil
    ) {
        self.positionSeconds = positionSeconds
        self.durationAtSave = durationAtSave
        self.lastChapterIndex = lastChapterIndex
        self.secondsIntoChapter = secondsIntoChapter
    }
}

public struct ProgressDTO: Decodable {
    public let bookId: String?
    public let positionSeconds: Int?
    public let durationAtSave: Int?
    public let completed: Bool?

    public init(bookId: String?, positionSeconds: Int?, durationAtSave: Int?, completed: Bool?) {
        self.bookId = bookId
        self.positionSeconds = positionSeconds
        self.durationAtSave = durationAtSave
        self.completed = completed
    }
}

public struct PlayerChapterDTO: Decodable, Identifiable {
    public let index: Int
    public let title: String
    public let start: Int
    public let end: Int

    public var id: Int { index }
}

public struct PlaybackDetailsDTO: Decodable {
    public let author: String?
    public let coverPath: String?
    public let series: String?
    public let seriesIndex: Int?
    public let genre: String?
    public let tags: [String]
    public let description: BookDescriptionDTO?
    public let durationSeconds: Double?
    public let chapters: [PlayerChapterDTO]

    public init(
        author: String?,
        coverPath: String?,
        series: String?,
        seriesIndex: Int?,
        genre: String?,
        tags: [String],
        description: BookDescriptionDTO?,
        durationSeconds: Double?,
        chapters: [PlayerChapterDTO]
    ) {
        self.author = author
        self.coverPath = coverPath
        self.series = series
        self.seriesIndex = seriesIndex
        self.genre = genre
        self.tags = tags
        self.description = description
        self.durationSeconds = durationSeconds
        self.chapters = chapters
    }
}
