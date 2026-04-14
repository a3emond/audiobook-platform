import Foundation
import AudiobookCore
import Combine

@MainActor
final class ProfileSettingsViewModel: ObservableObject {
    // Account
    @Published var selectedLocale = "en"

    // Playback
    @Published var forwardJumpSeconds = "30"
    @Published var backwardJumpSeconds = "15"
    @Published var playbackRate = "1.0"
    @Published var sleepTimerMode = "off"

    // Resume rewind
    @Published var resumeRewindEnabled = true
    @Published var rewindThresholdIndex = 3  // index into thresholdOptions
    @Published var rewindSecondsIndex = 2    // index into jumpOptions

    // Library
    @Published var showCompleted = true

    // Security
    @Published var currentPasswordForPasswordChange = ""
    @Published var newPassword = ""
    @Published var currentPasswordForEmailChange = ""
    @Published var newEmail = ""

    @Published private(set) var isLoading = false
    @Published private(set) var successMessage: String?
    @Published private(set) var errorMessage: String?

    static let jumpOptions: [(label: String, seconds: Int)] = [
        ("5 s", 5), ("10 s", 10), ("15 s", 15), ("20 s", 20), ("25 s", 25), ("30 s", 30)
    ]
    static let thresholdOptions: [(label: String, seconds: Int)] = [
        ("30 min", 1800), ("1 h", 3600), ("2 h", 7200), ("4 h", 14400),
        ("8 h", 28800), ("12 h", 43200), ("24 h", 86400), ("48 h", 172800),
        ("72 h", 259200), ("1 week", 604800)
    ]
    static let sleepModes: [(label: String, value: String)] = [
        ("Off", "off"), ("15 min", "15m"), ("30 min", "30m"),
        ("45 min", "45m"), ("60 min", "60m"), ("End of chapter", "chapter")
    ]

    private let settingsRepository: SettingsRepository
    private let authService: AuthService
    private let localization = LocalizationService.shared

    init(settingsRepository: SettingsRepository, authService: AuthService) {
        self.settingsRepository = settingsRepository
        self.authService = authService
    }

    func loadSettings() async {
        isLoading = true
        errorMessage = nil
        do {
            let s = try await settingsRepository.getSettings()
            selectedLocale = s.locale ?? "en"
            forwardJumpSeconds = String(s.player.forwardJumpSeconds ?? 30)
            backwardJumpSeconds = String(s.player.backwardJumpSeconds ?? 15)
            playbackRate = String(s.player.playbackRate ?? 1.0)
            sleepTimerMode = s.player.sleepTimerMode ?? "off"
            if let rr = s.player.resumeRewind {
                resumeRewindEnabled = rr.enabled ?? true
                let threshold = rr.thresholdSinceLastListenSeconds ?? 3600
                rewindThresholdIndex = Self.thresholdOptions.firstIndex(where: { $0.seconds >= threshold }) ?? 3
                let rewind = rr.rewindSeconds ?? 15
                rewindSecondsIndex = Self.jumpOptions.firstIndex(where: { $0.seconds >= rewind }) ?? 2
            }
            showCompleted = s.library?.showCompleted ?? true
        } catch {
            errorMessage = "Could not load settings."
        }
        isLoading = false
    }

    func saveSettings() async {
        isLoading = true
        successMessage = nil
        errorMessage = nil

        let forward = Int(forwardJumpSeconds) ?? 30
        let backward = Int(backwardJumpSeconds) ?? 15
        let rate = Double(playbackRate) ?? 1.0
        let threshold = Self.thresholdOptions[rewindThresholdIndex].seconds
        let rewindSec = Self.jumpOptions[rewindSecondsIndex].seconds

        let payload = UpdateSettingsPayloadDTO(
            locale: selectedLocale,
            player: SettingsDTO.PlayerDTO(
                forwardJumpSeconds: max(5, forward),
                backwardJumpSeconds: max(5, backward),
                playbackRate: min(max(0.5, rate), 3.0),
                sleepTimerMode: sleepTimerMode,
                resumeRewind: SettingsDTO.PlayerDTO.ResumeRewindDTO(
                    enabled: resumeRewindEnabled,
                    thresholdSinceLastListenSeconds: threshold,
                    rewindSeconds: rewindSec
                )
            ),
            library: SettingsDTO.LibraryDTO(
                completionThresholdPercent: nil,
                showCompleted: showCompleted
            )
        )
        do {
            _ = try await settingsRepository.updateSettings(payload)
            try? await localization.setLocale(selectedLocale)
            successMessage = "Settings saved."
        } catch {
            errorMessage = "Could not save settings."
        }
        isLoading = false
    }

    func changePassword() async {
        guard !currentPasswordForPasswordChange.isEmpty, !newPassword.isEmpty else {
            errorMessage = "Enter both current and new password."
            return
        }
        isLoading = true
        successMessage = nil
        errorMessage = nil
        do {
            try await authService.changePassword(
                currentPassword: currentPasswordForPasswordChange,
                newPassword: newPassword
            )
            currentPasswordForPasswordChange = ""
            newPassword = ""
            successMessage = "Password updated."
        } catch {
            errorMessage = "Could not update password."
        }
        isLoading = false
    }

    func changeEmail() async {
        guard !currentPasswordForEmailChange.isEmpty, !newEmail.isEmpty else {
            errorMessage = "Enter current password and new email."
            return
        }
        isLoading = true
        successMessage = nil
        errorMessage = nil
        do {
            try await authService.changeEmail(
                currentPassword: currentPasswordForEmailChange,
                newEmail: newEmail
            )
            currentPasswordForEmailChange = ""
            newEmail = ""
            successMessage = "Email updated."
        } catch {
            errorMessage = "Could not update email."
        }
        isLoading = false
    }

    func reset() {
        selectedLocale = "en"
        forwardJumpSeconds = "30"
        backwardJumpSeconds = "15"
        playbackRate = "1.0"
        sleepTimerMode = "off"
        resumeRewindEnabled = true
        rewindThresholdIndex = 3
        rewindSecondsIndex = 2
        showCompleted = true
        currentPasswordForPasswordChange = ""
        newPassword = ""
        currentPasswordForEmailChange = ""
        newEmail = ""
        isLoading = false
        successMessage = nil
        errorMessage = nil
    }
}
