import Foundation

public struct PaginationDTO: Decodable, Sendable {
    public let total: Int
    public let limit: Int
    public let offset: Int
    public let hasMore: Bool?

    public init(total: Int, limit: Int, offset: Int, hasMore: Bool? = nil) {
        self.total = total
        self.limit = limit
        self.offset = offset
        self.hasMore = hasMore
    }
}

public struct ChapterDTO: Codable, Identifiable, Sendable {
    public let index: Int
    public let title: String
    public let start: Int
    public let end: Int

    public var id: Int { index }

    public init(index: Int, title: String, start: Int, end: Int) {
        self.index = index
        self.title = title
        self.start = start
        self.end = end
    }
}

public struct BookDTO: Codable, Identifiable, Sendable {
    public let id: String
    public let filePath: String?
    public let checksum: String?
    public let title: String
    public let author: String?
    public let series: String?
    public let seriesIndex: Int?
    public let duration: Int?
    public let language: String?
    public let chapters: [ChapterDTO]?
    public let coverPath: String?
    public let tags: [String]?
    public let genre: String?
    public let createdAt: String?
    public let updatedAt: String?

    public init(
        id: String,
        filePath: String? = nil,
        checksum: String? = nil,
        title: String,
        author: String? = nil,
        series: String? = nil,
        seriesIndex: Int? = nil,
        duration: Int? = nil,
        language: String? = nil,
        chapters: [ChapterDTO]? = nil,
        coverPath: String? = nil,
        tags: [String]? = nil,
        genre: String? = nil,
        createdAt: String? = nil,
        updatedAt: String? = nil
    ) {
        self.id = id
        self.filePath = filePath
        self.checksum = checksum
        self.title = title
        self.author = author
        self.series = series
        self.seriesIndex = seriesIndex
        self.duration = duration
        self.language = language
        self.chapters = chapters
        self.coverPath = coverPath
        self.tags = tags
        self.genre = genre
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public struct BooksPageDTO: Decodable, Sendable {
    public let books: [BookDTO]
    public let total: Int
    public let limit: Int?
    public let offset: Int?

    public init(books: [BookDTO], total: Int, limit: Int? = nil, offset: Int? = nil) {
        self.books = books
        self.total = total
        self.limit = limit
        self.offset = offset
    }
}
