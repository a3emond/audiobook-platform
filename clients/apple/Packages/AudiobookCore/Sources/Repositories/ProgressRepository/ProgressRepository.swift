import Foundation

public protocol ProgressRepository {
    func listMine(limit: Int, offset: Int) async throws -> ProgressPageDTO
    func getForBook(bookId: String) async throws -> ProgressRecordDTO
    func save(bookId: String, payload: SaveProgressPayloadDTO, idempotencyKey: String?) async throws -> ProgressRecordDTO
    func markCompleted(bookId: String) async throws -> ProgressRecordDTO
    func unmarkCompleted(bookId: String) async throws -> ProgressRecordDTO
}

public final class ProgressRepositoryImpl: ProgressRepository {
    private let authService: AuthService

    public init(authService: AuthService) {
        self.authService = authService
    }

    public func listMine(limit: Int = 50, offset: Int = 0) async throws -> ProgressPageDTO {
        try await authService.authenticatedGet(path: "api/v1/progress", queryParams: ["limit": String(limit), "offset": String(offset)])
    }

    public func getForBook(bookId: String) async throws -> ProgressRecordDTO {
        try await authService.authenticatedGet(path: "api/v1/progress/\(bookId)")
    }

    public func save(bookId: String, payload: SaveProgressPayloadDTO, idempotencyKey: String? = nil) async throws -> ProgressRecordDTO {
        let headers = idempotencyKey.map { ["Idempotency-Key": $0] } ?? [:]
        return try await authService.authenticatedPut(path: "api/v1/progress/\(bookId)", body: payload, extraHeaders: headers)
    }

    public func markCompleted(bookId: String) async throws -> ProgressRecordDTO {
        struct Body: Encodable { let manual = true }
        return try await authService.authenticatedPost(path: "api/v1/progress/\(bookId)/complete", body: Body())
    }

    public func unmarkCompleted(bookId: String) async throws -> ProgressRecordDTO {
        try await authService.authenticatedDeleteJSON(path: "api/v1/progress/\(bookId)/complete")
    }
}
