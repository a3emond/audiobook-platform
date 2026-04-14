import Foundation

public struct LoginRequestDTO: Encodable {
    public let email: String
    public let password: String

    public init(email: String, password: String) {
        self.email = email
        self.password = password
    }
}

public struct RegisterRequestDTO: Encodable {
    public let email: String
    public let password: String
    public let displayName: String?
    public let preferredLocale: String?

    public init(email: String, password: String, displayName: String?, preferredLocale: String?) {
        self.email = email
        self.password = password
        self.displayName = displayName
        self.preferredLocale = preferredLocale
    }
}

public struct ChangePasswordRequestDTO: Encodable {
    public let currentPassword: String
    public let newPassword: String

    public init(currentPassword: String, newPassword: String) {
        self.currentPassword = currentPassword
        self.newPassword = newPassword
    }
}

public struct ChangeEmailRequestDTO: Encodable {
    public let currentPassword: String
    public let newEmail: String

    public init(currentPassword: String, newEmail: String) {
        self.currentPassword = currentPassword
        self.newEmail = newEmail
    }
}

public struct RefreshRequestDTO: Encodable {
    public let refreshToken: String

    public init(refreshToken: String) {
        self.refreshToken = refreshToken
    }
}

public struct LogoutRequestDTO: Encodable {
    public let refreshToken: String

    public init(refreshToken: String) {
        self.refreshToken = refreshToken
    }
}

public enum OAuthProviderDTO: String {
    case google
    case apple
}

public struct OAuthLoginRequestDTO: Encodable {
    public let idToken: String

    public init(idToken: String) {
        self.idToken = idToken
    }
}

public struct AuthTokensDTO: Decodable {
    public let accessToken: String
    public let refreshToken: String
}

public struct AuthUserDTO: Decodable {
    public let id: String
}

public struct AuthResponseDTO: Decodable {
    public let tokens: AuthTokensDTO
    public let user: AuthUserDTO
}

public struct RefreshResponseDTO: Decodable {
    public let accessToken: String
    public let refreshToken: String
}
