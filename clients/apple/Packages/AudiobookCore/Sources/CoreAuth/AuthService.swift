import Foundation

public final class AuthService {
    private struct EmptyResponseDTO: Decodable {}

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

    public var refreshToken: String? {
        sessionManager.refreshToken
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

    public func register(email: String, password: String, displayName: String?, preferredLocale: String?) async throws {
        let response: AuthResponseDTO = try await apiClient.postJSON(
            path: "api/v1/auth/register",
            body: RegisterRequestDTO(
                email: email,
                password: password,
                displayName: displayName,
                preferredLocale: preferredLocale
            )
        )
        sessionManager.updateSession(
            accessToken: response.tokens.accessToken,
            refreshToken: response.tokens.refreshToken,
            userId: response.user.id
        )
    }

    public func loginWithOAuth(provider: OAuthProviderDTO, idToken: String) async throws {
        let response: AuthResponseDTO = try await apiClient.postJSON(
            path: "api/v1/auth/oauth/\(provider.rawValue)",
            body: OAuthLoginRequestDTO(idToken: idToken)
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

    public func signOut() async {
        defer {
            sessionManager.clear()
        }

        guard let refreshToken = sessionManager.refreshToken else {
            return
        }

        do {
            let _: EmptyResponseDTO = try await apiClient.postJSON(
                path: "api/v1/auth/logout",
                body: LogoutRequestDTO(refreshToken: refreshToken)
            )
        } catch {
            // Clear local auth state even if logout revocation fails.
        }
    }

    public func changePassword(currentPassword: String, newPassword: String) async throws {
        let _: EmptyResponseDTO = try await authenticatedPost(
            path: "api/v1/auth/change-password",
            body: ChangePasswordRequestDTO(currentPassword: currentPassword, newPassword: newPassword)
        )
    }

    public func changeEmail(currentPassword: String, newEmail: String) async throws {
        let _: EmptyResponseDTO = try await authenticatedPost(
            path: "api/v1/auth/change-email",
            body: ChangeEmailRequestDTO(currentPassword: currentPassword, newEmail: newEmail)
        )
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
        body: Body,
        extraHeaders: [String: String] = [:]
    ) async throws -> Response {
        try await executeWithAuthRetry { token in
            try await apiClient.postJSON(
                path: path,
                body: body,
                headers: mergedHeaders(token: token, extraHeaders: extraHeaders)
            )
        }
    }

    public func authenticatedPut<Response: Decodable, Body: Encodable>(
        path: String,
        body: Body,
        extraHeaders: [String: String] = [:]
    ) async throws -> Response {
        try await executeWithAuthRetry { token in
            try await apiClient.putJSON(
                path: path,
                body: body,
                headers: mergedHeaders(token: token, extraHeaders: extraHeaders)
            )
        }
    }

    public func authenticatedPatch<Response: Decodable, Body: Encodable>(
        path: String,
        body: Body,
        extraHeaders: [String: String] = [:]
    ) async throws -> Response {
        try await executeWithAuthRetry { token in
            try await apiClient.patchJSON(
                path: path,
                body: body,
                headers: mergedHeaders(token: token, extraHeaders: extraHeaders)
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

    public func authenticatedDeleteJSON<Response: Decodable>(path: String) async throws -> Response {
        try await executeWithAuthRetry { token in
            try await apiClient.deleteJSON(path: path, headers: ["Authorization": "Bearer \(token)"])
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

    private func mergedHeaders(token: String, extraHeaders: [String: String]) -> [String: String] {
        var headers = ["Authorization": "Bearer \(token)"]
        for (key, value) in extraHeaders {
            headers[key] = value
        }
        return headers
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

