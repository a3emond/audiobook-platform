import Foundation

public final class PlayerRepository {
    private let authService: AuthService
    private let apiClient: APIClient

    public init(authService: AuthService, apiClient: APIClient) {
        self.authService = authService
        self.apiClient = apiClient
    }

    public func resumeInfo(bookId: String) async throws -> ResumeInfoDTO {
        try await authService.authenticatedGet(path: "streaming/books/\(bookId)/resume")
    }

    public func saveProgress(
        bookId: String,
        positionSeconds: Int,
        durationAtSave: Int,
        lastChapterIndex: Int? = nil,
        secondsIntoChapter: Int? = nil
    ) async throws {
        let request = SaveProgressRequestDTO(
            positionSeconds: positionSeconds,
            durationAtSave: durationAtSave,
            lastChapterIndex: lastChapterIndex,
            secondsIntoChapter: secondsIntoChapter
        )

        let _: ProgressDTO = try await authService.authenticatedPut(
            path: "api/v1/progress/\(bookId)",
            body: request
        )
    }

    public func fetchProgress(bookId: String) async throws -> ProgressDTO {
        try await authService.authenticatedGet(path: "api/v1/progress/\(bookId)")
    }

    public func fetchSettings() async throws -> UserSettingsDTO {
        try await authService.authenticatedGet(path: "api/v1/settings")
    }

    public func fetchPlaybackDetails(bookId: String) async throws -> PlaybackDetailsDTO {
        try await authService.authenticatedGet(path: "api/v1/books/\(bookId)")
    }

    public func streamURL(streamPath: String) -> URL {
        let normalized = streamPath.hasPrefix("/") ? String(streamPath.dropFirst()) : streamPath
        return apiClient.makeURL(path: normalized)
    }
}
