import SwiftUI
import AudiobookCore

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published private(set) var user: UserProfileDTO?
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?
    @Published var selectedLocale: String = "en"
    var onSignOut: (() -> Void)?
    var onLanguageChanged: (() -> Void)?

    private let authService: AuthService
    private let localization = LocalizationService.shared

    init(authService: AuthService) {
        self.authService = authService
        self.selectedLocale = localization.locale
    }

    func load() async {
        isLoading = true
        errorMessage = nil

        do {
            let profile = try await authService.fetchProfile()
            self.user = profile
            self.isLoading = false
        } catch {
            self.errorMessage = error.localizedDescription
            self.isLoading = false
        }
    }

    func changeLanguage(to locale: String) async {
        do {
            try await localization.setLocale(locale)
            selectedLocale = locale
            onLanguageChanged?()
        } catch {
            errorMessage = "Could not change language"
        }
    }

    func signOut() {
        authService.signOut()
        onSignOut?()
    }
}
