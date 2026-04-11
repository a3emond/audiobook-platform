import Foundation

public final class LibraryRepository {
    private let authService: AuthService

    public init(authService: AuthService) {
        self.authService = authService
    }

    public func listBooks(language: String = "en") async throws -> [LibraryBookDTO] {
        let response: LibraryListResponseDTO = try await authService.authenticatedGet(
            path: "api/v1/books",
            queryParams: ["language": language]
        )
        return response.books
    }
}
