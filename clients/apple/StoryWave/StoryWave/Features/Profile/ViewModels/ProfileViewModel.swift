import SwiftUI
import AudiobookCore
import Combine

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published private(set) var user: UserProfileDTO?
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var selectedLocale: String = "en"

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
        } catch {
            errorMessage = "Could not change language"
        }
    }

    func signOut() async {
        await authService.signOut()
        user = nil
    }
}

