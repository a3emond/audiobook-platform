import Foundation

public protocol AdminRepository {
    func overview() async throws -> AdminOverviewDTO
    func coverage() async throws -> AdminCoverageResponseDTO
    func listBooks(query: String?, language: String?, limit: Int, offset: Int) async throws -> BooksPageDTO
    func book(id: String) async throws -> BookDTO
    func updateBookMetadata(bookId: String, payload: AdminBookMetadataUpdateDTO) async throws -> BookDTO
    func updateBookChapters(bookId: String, payload: AdminBookChaptersUpdateDTO) async throws -> BookDTO
    func deleteBook(bookId: String) async throws

    func listJobs(status: String?, type: String?, limit: Int, offset: Int) async throws -> AdminJobsPageDTO
    func cancelJob(jobId: String) async throws -> AdminJobDTO

    func listUsers(role: String?, limit: Int, offset: Int) async throws -> AdminUsersPageDTO
    func updateUserRole(userId: String, role: String) async throws -> AdminUserDTO
}

public final class AdminRepositoryImpl: AdminRepository {
    private let authService: AuthService

    public init(authService: AuthService) {
        self.authService = authService
    }

    public func overview() async throws -> AdminOverviewDTO {
        try await authService.authenticatedGet(path: "api/v1/admin/overview")
    }

    public func coverage() async throws -> AdminCoverageResponseDTO {
        try await authService.authenticatedGet(path: "api/v1/admin/coverage")
    }

    public func listBooks(query: String?, language: String?, limit: Int, offset: Int) async throws -> BooksPageDTO {
        var params: [String: String] = [
            "limit": String(limit),
            "offset": String(offset)
        ]
        if let query, !query.isEmpty {
            params["q"] = query
        }
        if let language, !language.isEmpty {
            params["language"] = language
        }

        return try await authService.authenticatedGet(path: "api/v1/admin/books", queryParams: params)
    }

    public func book(id: String) async throws -> BookDTO {
        try await authService.authenticatedGet(path: "api/v1/admin/books/\(id)")
    }

    public func updateBookMetadata(bookId: String, payload: AdminBookMetadataUpdateDTO) async throws -> BookDTO {
        try await authService.authenticatedPatch(path: "api/v1/admin/books/\(bookId)/metadata", body: payload)
    }

    public func updateBookChapters(bookId: String, payload: AdminBookChaptersUpdateDTO) async throws -> BookDTO {
        try await authService.authenticatedPatch(path: "api/v1/admin/books/\(bookId)/chapters", body: payload)
    }

    public func deleteBook(bookId: String) async throws {
        try await authService.authenticatedDelete(path: "api/v1/admin/books/\(bookId)")
    }

    public func listJobs(status: String?, type: String?, limit: Int, offset: Int) async throws -> AdminJobsPageDTO {
        var params: [String: String] = [
            "limit": String(limit),
            "offset": String(offset)
        ]
        if let status, !status.isEmpty {
            params["status"] = status
        }
        if let type, !type.isEmpty {
            params["type"] = type
        }

        return try await authService.authenticatedGet(path: "api/v1/admin/jobs", queryParams: params)
    }

    public func cancelJob(jobId: String) async throws -> AdminJobDTO {
        struct CancelBody: Encodable { let reason: String }
        return try await authService.authenticatedPost(path: "api/v1/admin/jobs/\(jobId)/cancel", body: CancelBody(reason: "cancelled_from_apple_app"))
    }

    public func listUsers(role: String?, limit: Int, offset: Int) async throws -> AdminUsersPageDTO {
        var params: [String: String] = [
            "limit": String(limit),
            "offset": String(offset)
        ]
        if let role, !role.isEmpty {
            params["role"] = role
        }

        return try await authService.authenticatedGet(path: "api/v1/admin/users", queryParams: params)
    }

    public func updateUserRole(userId: String, role: String) async throws -> AdminUserDTO {
        try await authService.authenticatedPatch(path: "api/v1/admin/users/\(userId)/role", body: AdminUpdateUserRoleDTO(role: role))
    }
}
