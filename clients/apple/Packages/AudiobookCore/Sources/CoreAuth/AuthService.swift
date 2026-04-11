import Foundation

public final class AuthService {
    private let apiClient: APIClient
    private let sessionManager: AuthSessionManager

    public init(apiClient: APIClient, sessionManager: AuthSessionManager) {
        self.apiClient = apiClient
        self.sessionManager = sessionManager
    }

    public var isAuthenticated: Bool {
        sessionManager.accessToken != nil && sessionManager.refreshToken != nil
    }

    public var accessToken: String? {
        sessionManager.accessToken
    }

    public var userId: String? {
        sessionManager.userId
    }

    public func login(email: String, password: String) async throws {
        let response: AuthResponseDTO = try await apiClient.postJSON(
            path: "api/v1/auth/login",
            body: LoginRequestDTO(email: email, password: password)
        )
        sessionManager.updateSession(
            accessToken: response.tokens.accessToken,
            refreshToken: response.tokens.refreshToken,
            userId: response.user.id
        )
    }

    public func refreshSession() async throws {
        guard let currentRefreshToken = sessionManager.refreshToken else {
            throw AuthServiceError.missingRefreshToken
        }

        let response: RefreshResponseDTO = try await apiClient.postJSON(
            path: "api/v1/auth/refresh",
            body: RefreshRequestDTO(refreshToken: currentRefreshToken)
        )

        sessionManager.updateSession(
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            userId: sessionManager.userId
        )
    }

    public func signOut() {
        sessionManager.clear()
    }

    public func authenticatedGet<Response: Decodable>(path: String, queryParams: [String: String] = [:]) async throws -> Response {
        try await executeWithAuthRetry { token in
            try await apiClient.getJSON(
                path: path,
                queryParams: queryParams,
                headers: ["Authorization": "Bearer \(token)"]
            )
        }
    }

    public func authenticatedPost<Response: Decodable, Body: Encodable>(
        path: String,
        body: Body
    ) async throws -> Response {
        try await executeWithAuthRetry { token in
            try await apiClient.postJSON(
                path: path,
                body: body,
                headers: ["Authorization": "Bearer \(token)"]
            )
        }
    }

    public func authenticatedPut<Response: Decodable, Body: Encodable>(
        path: String,
        body: Body
    ) async throws -> Response {
        try await executeWithAuthRetry { token in
            try await apiClient.putJSON(
                path: path,
                body: body,
                headers: ["Authorization": "Bearer \(token)"]
            )
        }
    }

    public func authenticatedPatch<Response: Decodable, Body: Encodable>(
        path: String,
        body: Body
    ) async throws -> Response {
        try await executeWithAuthRetry { token in
            try await apiClient.patchJSON(
                path: path,
                body: body,
                headers: ["Authorization": "Bearer \(token)"]
            )
        }
    }

    public func authenticatedDelete(path: String) async throws {
        _ = try await executeWithAuthRetry { token in
            try await apiClient.delete(
                path: path,
                headers: ["Authorization": "Bearer \(token)"]
            )
            return true
        }
    }

    public func fetchProfile() async throws -> UserProfileDTO {
        try await authenticatedGet(path: "api/v1/auth/me")
    }

    private func executeWithAuthRetry<T>(
        _ request: (String) async throws -> T
    ) async throws -> T {
        guard let token = sessionManager.accessToken else {
            throw AuthServiceError.missingAccessToken
        }

        do {
            return try await request(token)
        } catch APIClientError.httpError(let code, _) where code == 401 || code == 403 {
            try await refreshSession()
            guard let refreshedToken = sessionManager.accessToken else {
                throw AuthServiceError.missingAccessToken
            }

            return try await request(refreshedToken)
        }
    }
}

public enum AuthServiceError: Error {
    case missingAccessToken
    case missingRefreshToken
}

public struct UserProfileDTO: Decodable {
    public let id: String
    public let email: String
    public let displayName: String?
    public let role: String?
    public let createdAt: String?
}

