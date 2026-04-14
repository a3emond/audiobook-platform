import Foundation

public protocol AdminRepository {
    func overview() async throws -> AdminOverviewDTO
    func coverage() async throws -> AdminCoverageResponseDTO
    func uploadBook(fileName: String, fileData: Data, mimeType: String, language: String) async throws -> AdminUploadJobResponseDTO
    func listBooks(query: String?, language: String?, limit: Int, offset: Int) async throws -> BooksPageDTO
    func book(id: String) async throws -> BookDTO
    func updateBookMetadata(bookId: String, payload: AdminBookMetadataUpdateDTO) async throws -> BookDTO
    func updateBookChapters(bookId: String, payload: AdminBookChaptersUpdateDTO) async throws -> BookDTO
    func deleteBook(bookId: String) async throws
    func uploadCoverFromURL(bookId: String, url: String) async throws -> BookDTO
    func uploadCoverFile(bookId: String, imageData: Data, fileName: String) async throws -> BookDTO
    func listJobs(status: String?, type: String?, limit: Int, offset: Int) async throws -> AdminJobsPageDTO
    func cancelJob(jobId: String) async throws -> AdminJobDTO
    func getJobLogs(jobId: String, level: String?, limit: Int, offset: Int) async throws -> JobLogsPageDTO
    func enqueueJob(type: String, force: Bool?) async throws -> AdminJobDTO
    func getWorkerSettings() async throws -> WorkerSettingsDTO
    func updateWorkerSettings(_ payload: UpdateWorkerSettingsPayloadDTO) async throws -> WorkerSettingsDTO
    func listUsers(role: String?, limit: Int, offset: Int) async throws -> AdminUsersPageDTO
    func updateUserRole(userId: String, role: String) async throws -> AdminUserDTO
}

public final class AdminRepositoryImpl: AdminRepository {
    private let authService: AuthService
    private let apiClient: APIClient

    public init(authService: AuthService, apiClient: APIClient) {
        self.authService = authService
        self.apiClient = apiClient
    }

    public func overview() async throws -> AdminOverviewDTO {
        try await authService.authenticatedGet(path: "api/v1/admin/overview")
    }

    public func coverage() async throws -> AdminCoverageResponseDTO {
        try await authService.authenticatedGet(path: "api/v1/admin/coverage")
    }

    public func uploadBook(fileName: String, fileData: Data, mimeType: String, language: String) async throws -> AdminUploadJobResponseDTO {
        guard let token = authService.accessToken else {
            throw AuthServiceError.missingAccessToken
        }
        return try await apiClient.postMultipart(
            path: "api/v1/admin/books/upload",
            parts: [MultipartFormPart(name: "file", fileName: fileName, mimeType: mimeType, data: fileData)],
            fields: ["language": language],
            headers: ["Authorization": "Bearer \(token)"]
        )
    }

    public func listBooks(query: String?, language: String?, limit: Int, offset: Int) async throws -> BooksPageDTO {
        var params: [String: String] = ["limit": String(limit), "offset": String(offset)]
        if let query, !query.isEmpty { params["q"] = query }
        if let language, !language.isEmpty { params["language"] = language }
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

    public func uploadCoverFromURL(bookId: String, url: String) async throws -> BookDTO {
        struct Body: Encodable { let url: String }
        return try await authService.authenticatedPost(path: "api/v1/admin/books/\(bookId)/cover/url", body: Body(url: url))
    }

    public func uploadCoverFile(bookId: String, imageData: Data, fileName: String) async throws -> BookDTO {
        guard let token = authService.accessToken else {
            throw AuthServiceError.missingAccessToken
        }
        let ext = (fileName as NSString).pathExtension.lowercased()
        let mime: String
        switch ext {
        case "jpg", "jpeg": mime = "image/jpeg"
        case "png":         mime = "image/png"
        case "webp":        mime = "image/webp"
        default:            mime = "image/jpeg"
        }
        return try await apiClient.postMultipart(
            path: "api/v1/admin/books/\(bookId)/cover",
            parts: [MultipartFormPart(name: "cover", fileName: fileName, mimeType: mime, data: imageData)],
            fields: [:],
            headers: ["Authorization": "Bearer \(token)"]
        )
    }

    public func listJobs(status: String?, type: String?, limit: Int, offset: Int) async throws -> AdminJobsPageDTO {
        var params: [String: String] = ["limit": String(limit), "offset": String(offset)]
        if let status, !status.isEmpty { params["status"] = status }
        if let type, !type.isEmpty { params["type"] = type }
        return try await authService.authenticatedGet(path: "api/v1/admin/jobs", queryParams: params)
    }

    public func cancelJob(jobId: String) async throws -> AdminJobDTO {
        try await authService.authenticatedDeleteJSON(path: "api/v1/admin/jobs/\(jobId)")
    }

    public func getJobLogs(jobId: String, level: String?, limit: Int = 100, offset: Int = 0) async throws -> JobLogsPageDTO {
        var params: [String: String] = ["limit": String(limit), "offset": String(offset)]
        if let level, !level.isEmpty { params["level"] = level }
        return try await authService.authenticatedGet(path: "api/v1/admin/jobs/\(jobId)/logs", queryParams: params)
    }

    public func enqueueJob(type: String, force: Bool? = nil) async throws -> AdminJobDTO {
        try await authService.authenticatedPost(path: "api/v1/admin/jobs/enqueue", body: EnqueueJobRequestDTO(type: type, force: force))
    }

    public func getWorkerSettings() async throws -> WorkerSettingsDTO {
        try await authService.authenticatedGet(path: "api/v1/admin/worker-settings")
    }

    public func updateWorkerSettings(_ payload: UpdateWorkerSettingsPayloadDTO) async throws -> WorkerSettingsDTO {
        try await authService.authenticatedPatch(path: "api/v1/admin/worker-settings", body: payload)
    }

    public func listUsers(role: String?, limit: Int, offset: Int) async throws -> AdminUsersPageDTO {
        var params: [String: String] = ["limit": String(limit), "offset": String(offset)]
        if let role, !role.isEmpty { params["role"] = role }
        return try await authService.authenticatedGet(path: "api/v1/admin/users", queryParams: params)
    }

    public func updateUserRole(userId: String, role: String) async throws -> AdminUserDTO {
        try await authService.authenticatedPatch(path: "api/v1/admin/users/\(userId)/role", body: AdminUpdateUserRoleDTO(role: role))
    }
}
