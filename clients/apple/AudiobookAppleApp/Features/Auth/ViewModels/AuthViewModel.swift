import Foundation
import AudiobookCore

@MainActor
final class AuthViewModel: ObservableObject {
    @Published private(set) var state = AuthViewState()

    private let authService: AuthService

    init(authService: AuthService) {
        self.authService = authService
        self.state.isAuthenticated = authService.isAuthenticated
    }

    func updateEmail(_ value: String) {
        state.email = value
    }

    func updatePassword(_ value: String) {
        state.password = value
    }

    func login() async {
        state.isLoading = true
        state.errorMessage = nil

        do {
            try await authService.login(email: state.email, password: state.password)
            state.isAuthenticated = true
        } catch {
            state.errorMessage = "Login failed. Check credentials and try again."
            state.isAuthenticated = false
        }

        state.isLoading = false
    }

    func refreshSession() async {
        do {
            try await authService.refreshSession()
            state.isAuthenticated = true
        } catch {
            state.errorMessage = "Session expired. Please sign in again."
            state.isAuthenticated = false
        }
    }

    func signOut() {
        authService.signOut()
        state.isAuthenticated = false
        state.password = ""
    }
}
