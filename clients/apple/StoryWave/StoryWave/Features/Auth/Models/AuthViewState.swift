import Foundation

struct AuthViewState {
    enum OAuthProvider: String {
        case google
        case apple
    }

    enum Mode {
        case login
        case register
    }

    var mode: Mode = .login
    var email: String = ""
    var password: String = ""
    var confirmPassword: String = ""
    var displayName: String = ""
    var preferredLocale: String = "en"
    var isLoading: Bool = false
    var oauthLoadingProvider: OAuthProvider?
    var errorMessage: String?
    var isAuthenticated: Bool = false
}
