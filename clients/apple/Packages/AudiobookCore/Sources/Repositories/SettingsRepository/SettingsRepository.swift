import Foundation

public protocol SettingsRepository {
    func getSettings() async throws -> SettingsDTO
    func updateSettings(_ payload: UpdateSettingsPayloadDTO) async throws -> SettingsDTO
}

public final class SettingsRepositoryImpl: SettingsRepository {
    private let authService: AuthService

    public init(authService: AuthService) {
        self.authService = authService
    }

    public func getSettings() async throws -> SettingsDTO {
        try await authService.authenticatedGet(path: "api/v1/settings")
    }

    public func updateSettings(_ payload: UpdateSettingsPayloadDTO) async throws -> SettingsDTO {
        try await authService.authenticatedPatch(path: "api/v1/settings", body: payload)
    }
}
