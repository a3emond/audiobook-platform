import Foundation

struct AuthViewState {
    var email: String = ""
    var password: String = ""
    var isLoading: Bool = false
    var errorMessage: String?
    var isAuthenticated: Bool = false
}
