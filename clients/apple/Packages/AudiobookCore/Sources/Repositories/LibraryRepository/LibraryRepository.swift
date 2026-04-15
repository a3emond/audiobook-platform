import Foundation

public protocol LibraryRepository {
    func listBooks(language: String, query: String?, limit: Int, offset: Int) async throws -> BooksPageDTO
    func listBooks(language: String) async throws -> [LibraryBookDTO]
    func book(id: String) async throws -> BookDTO
    func listCollections(limit: Int, offset: Int) async throws -> CollectionsPageDTO
    func createCollection(payload: UpsertCollectionRequestDTO) async throws -> CollectionDTO
    func updateCollection(id: String, payload: UpsertCollectionRequestDTO) async throws -> CollectionDTO
    func deleteCollection(id: String) async throws
    func listSeries(language: String?) async throws -> [String]
    func seriesDetail(name: String, language: String?) async throws -> SeriesDetailDTO
}

public final class LibraryRepositoryImpl: LibraryRepository {
    private let authService: AuthService

    public init(authService: AuthService) {
        self.authService = authService
    }

    public func listBooks(language: String = "en", query: String? = nil, limit: Int = 50, offset: Int = 0) async throws -> BooksPageDTO {
        var params: [String: String] = [
            "language": language,
            "limit": String(limit),
            "offset": String(offset)
        ]
        if let query, !query.isEmpty {
            params["q"] = query
        }

        return try await authService.authenticatedGet(path: "api/v1/books", queryParams: params)
    }

    public func listBooks(language: String = "en") async throws -> [LibraryBookDTO] {
        let page = try await listBooks(language: language, query: nil, limit: 300, offset: 0)
        return page.books.map { book in
            LibraryBookDTO(
                id: book.id,
                title: book.title,
                author: book.author,
                coverPath: book.coverPath
            )
        }
    }

    public func book(id: String) async throws -> BookDTO {
        try await authService.authenticatedGet(path: "api/v1/books/\(id)")
    }

    public func listCollections(limit: Int = 100, offset: Int = 0) async throws -> CollectionsPageDTO {
        try await authService.authenticatedGet(
            path: "api/v1/collections",
            queryParams: ["limit": String(limit), "offset": String(offset)]
        )
    }

    public func createCollection(payload: UpsertCollectionRequestDTO) async throws -> CollectionDTO {
        try await authService.authenticatedPost(path: "api/v1/collections", body: payload)
    }

    public func updateCollection(id: String, payload: UpsertCollectionRequestDTO) async throws -> CollectionDTO {
        try await authService.authenticatedPut(path: "api/v1/collections/\(id)", body: payload)
    }

    public func deleteCollection(id: String) async throws {
        try await authService.authenticatedDelete(path: "api/v1/collections/\(id)")
    }

    public func listSeries(language: String? = nil) async throws -> [String] {
        var params: [String: String] = [:]
        if let language, !language.isEmpty {
            params["language"] = language
        }

        struct SeriesListDTO: Decodable { let series: [String] }
        let response: SeriesListDTO = try await authService.authenticatedGet(path: "api/v1/series", queryParams: params)
        return response.series
    }

    public func seriesDetail(name: String, language: String? = nil) async throws -> SeriesDetailDTO {
        let normalizedName = name.trimmingCharacters(in: .whitespacesAndNewlines)

        var params: [String: String] = [:]
        if let language, !language.isEmpty {
            params["language"] = language
        }

        return try await authService.authenticatedGet(path: "api/v1/series/\(normalizedName)", queryParams: params)
    }
}
