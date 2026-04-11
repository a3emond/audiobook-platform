import Foundation

public struct LoginRequestDTO: Encodable {
    public let email: String
    public let password: String

    public init(email: String, password: String) {
        self.email = email
        self.password = password
    }
}

public struct RefreshRequestDTO: Encodable {
    public let refreshToken: String

    public init(refreshToken: String) {
        self.refreshToken = refreshToken
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
