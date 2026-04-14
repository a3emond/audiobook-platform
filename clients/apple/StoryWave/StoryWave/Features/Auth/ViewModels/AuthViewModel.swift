import Foundation
import AudiobookCore
import Combine

@MainActor
final class AuthViewModel: ObservableObject {
    @Published private(set) var state = AuthViewState()

    private let authService: AuthService
    private var authStateTask: Task<Void, Never>?

    init(authService: AuthService) {
        self.authService = authService
        self.state.isAuthenticated = authService.isAuthenticated
        subscribeToAuthState()
    }
    
    private func subscribeToAuthState() {
        authStateTask?.cancel()
        authStateTask = Task {
            // Monitor auth state for changes
            var lastKnownState = authService.isAuthenticated
            
            while !Task.isCancelled {
                let currentState = authService.isAuthenticated
                if currentState != lastKnownState {
                    await MainActor.run {
                        self.state.isAuthenticated = currentState
                    }
                    lastKnownState = currentState
                }
                try? await Task.sleep(nanoseconds: 500_000_000) // Check every 0.5s
            }
        }
    }
    
    deinit {
        authStateTask?.cancel()
    }

    func updateEmail(_ value: String) {
        state.email = value
    }

    func updatePassword(_ value: String) {
        state.password = value
    }

    func updateConfirmPassword(_ value: String) {
        state.confirmPassword = value
    }

    func updateDisplayName(_ value: String) {
        state.displayName = value
    }

    func updatePreferredLocale(_ value: String) {
        state.preferredLocale = value
    }

    func switchMode(_ mode: AuthViewState.Mode) {
        state.mode = mode
        state.errorMessage = nil
    }

    func setErrorMessage(_ message: String?) {
        state.errorMessage = message
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

    func register() async {
        guard state.password == state.confirmPassword else {
            state.errorMessage = "Passwords do not match."
            return
        }

        state.isLoading = true
        state.errorMessage = nil

        do {
            let displayName = state.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            try await authService.register(
                email: state.email,
                password: state.password,
                displayName: displayName.isEmpty ? nil : displayName,
                preferredLocale: state.preferredLocale
            )
            state.isAuthenticated = true
        } catch {
            state.errorMessage = "Registration failed. Try again with a different email."
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

    func signOut() async {
        await authService.signOut()
        state.isAuthenticated = false
        state.password = ""
        state.confirmPassword = ""
    }

    func loginWithOAuth(provider: AuthViewState.OAuthProvider, idToken: String) async {
        state.oauthLoadingProvider = provider
        state.errorMessage = nil

        do {
            switch provider {
            case .google:
                try await authService.loginWithOAuth(provider: .google, idToken: idToken)
            case .apple:
                try await authService.loginWithOAuth(provider: .apple, idToken: idToken)
            }
            state.isAuthenticated = true
        } catch {
            state.errorMessage = "OAuth login failed. Please try again."
            state.isAuthenticated = false
        }

        state.oauthLoadingProvider = nil
    }
}
