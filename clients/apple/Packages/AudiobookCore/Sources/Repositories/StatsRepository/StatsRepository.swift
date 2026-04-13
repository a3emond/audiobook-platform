import Foundation

public protocol StatsRepository {
    func getMine() async throws -> UserStatsDTO
    func listSessions(bookId: String?, limit: Int, offset: Int) async throws -> SessionsPageDTO
    func createSession(_ payload: CreateSessionPayloadDTO, idempotencyKey: String?) async throws -> String
}

public final class StatsRepositoryImpl: StatsRepository {
    private struct CreateSessionResponse: Decodable {
        let id: String
    }

    private let authService: AuthService

    public init(authService: AuthService) {
        self.authService = authService
    }

    public func getMine() async throws -> UserStatsDTO {
        try await authService.authenticatedGet(path: "api/v1/stats/me")
    }

    public func listSessions(bookId: String? = nil, limit: Int = 100, offset: Int = 0) async throws -> SessionsPageDTO {
        var params: [String: String] = ["limit": String(limit), "offset": String(offset)]
        if let bookId, !bookId.isEmpty {
            params["bookId"] = bookId
        }

        return try await authService.authenticatedGet(path: "api/v1/stats/sessions", queryParams: params)
    }

    public func createSession(_ payload: CreateSessionPayloadDTO, idempotencyKey: String? = nil) async throws -> String {
        let headers = idempotencyKey.map { ["Idempotency-Key": $0] } ?? [:]
        let response: CreateSessionResponse = try await authService.authenticatedPost(
            path: "api/v1/stats/sessions",
            body: payload,
            extraHeaders: headers
        )
        return response.id
    }
}
