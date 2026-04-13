import Foundation

public protocol PlayerRepository {
    func resumeInfo(bookId: String) async throws -> ResumeInfoDTO
    func saveProgress(bookId: String, payload: SaveProgressPayloadDTO, idempotencyKey: String?) async throws -> ProgressRecordDTO
    func saveProgress(bookId: String, positionSeconds: Int, durationAtSave: Int, lastChapterIndex: Int?, secondsIntoChapter: Int?) async throws
    func fetchProgress(bookId: String) async throws -> ProgressRecordDTO
    func fetchProgressLegacy(bookId: String) async throws -> ProgressDTO
    func markCompleted(bookId: String) async throws -> ProgressRecordDTO
    func unmarkCompleted(bookId: String) async throws -> ProgressRecordDTO
    func fetchSettings() async throws -> SettingsDTO
    func fetchSettingsLegacy() async throws -> UserSettingsDTO
    func updateSettings(payload: UpdateSettingsPayloadDTO) async throws -> SettingsDTO
    func fetchBook(bookId: String) async throws -> BookDTO
    func fetchPlaybackDetails(bookId: String) async throws -> PlaybackDetailsDTO
    func streamURL(streamPath: String) -> URL
}

public final class PlayerRepositoryImpl: PlayerRepository {
    private let authService: AuthService
    private let apiClient: APIClient

    public init(authService: AuthService, apiClient: APIClient) {
        self.authService = authService
        self.apiClient = apiClient
    }

    public func resumeInfo(bookId: String) async throws -> ResumeInfoDTO {
        try await authService.authenticatedGet(path: "streaming/books/\(bookId)/resume")
    }

    public func saveProgress(bookId: String, payload: SaveProgressPayloadDTO, idempotencyKey: String? = nil) async throws -> ProgressRecordDTO {
        try await authService.authenticatedPut(path: "api/v1/progress/\(bookId)", body: payload, extraHeaders: idempotencyHeaders(idempotencyKey))
    }

    public func saveProgress(
        bookId: String,
        positionSeconds: Int,
        durationAtSave: Int,
        lastChapterIndex: Int? = nil,
        secondsIntoChapter: Int? = nil
    ) async throws {
        _ = try await saveProgress(
            bookId: bookId,
            payload: SaveProgressPayloadDTO(
                positionSeconds: positionSeconds,
                durationAtSave: durationAtSave,
                lastChapterIndex: lastChapterIndex,
                secondsIntoChapter: secondsIntoChapter
            ),
            idempotencyKey: nil
        )
    }

    public func fetchProgress(bookId: String) async throws -> ProgressRecordDTO {
        try await authService.authenticatedGet(path: "api/v1/progress/\(bookId)")
    }

    public func fetchProgressLegacy(bookId: String) async throws -> ProgressDTO {
        let progress = try await fetchProgress(bookId: bookId)
        return ProgressDTO(
            bookId: progress.bookId,
            positionSeconds: progress.positionSeconds,
            durationAtSave: progress.durationAtSave,
            completed: progress.completed
        )
    }

    public func markCompleted(bookId: String) async throws -> ProgressRecordDTO {
        struct MarkPayload: Encodable { let manual = true }
        return try await authService.authenticatedPost(path: "api/v1/progress/\(bookId)/complete", body: MarkPayload())
    }

    public func unmarkCompleted(bookId: String) async throws -> ProgressRecordDTO {
        try await authService.authenticatedDeleteJSON(path: "api/v1/progress/\(bookId)/complete")
    }

    public func fetchSettings() async throws -> SettingsDTO {
        try await authService.authenticatedGet(path: "api/v1/settings")
    }

    public func fetchSettingsLegacy() async throws -> UserSettingsDTO {
        let settings = try await fetchSettings()
        return UserSettingsDTO(
            locale: settings.locale,
            player: PlayerSettingsDTO(
                forwardJumpSeconds: settings.player.forwardJumpSeconds,
                backwardJumpSeconds: settings.player.backwardJumpSeconds,
                playbackRate: settings.player.playbackRate,
                resumeRewind: ResumeRewindSettingsDTO(
                    enabled: settings.player.resumeRewind?.enabled,
                    thresholdSinceLastListenSeconds: settings.player.resumeRewind?.thresholdSinceLastListenSeconds,
                    rewindSeconds: settings.player.resumeRewind?.rewindSeconds
                )
            )
        )
    }

    public func updateSettings(payload: UpdateSettingsPayloadDTO) async throws -> SettingsDTO {
        try await authService.authenticatedPatch(path: "api/v1/settings", body: payload)
    }

    public func fetchBook(bookId: String) async throws -> BookDTO {
        try await authService.authenticatedGet(path: "api/v1/books/\(bookId)")
    }

    public func fetchPlaybackDetails(bookId: String) async throws -> PlaybackDetailsDTO {
        let book = try await fetchBook(bookId: bookId)
        let mappedChapters = (book.chapters ?? []).map {
            PlayerChapterDTO(index: $0.index, title: $0.title, start: $0.start, end: $0.end)
        }

        return PlaybackDetailsDTO(author: book.author, coverPath: book.coverPath, chapters: mappedChapters)
    }

    public func streamURL(streamPath: String) -> URL {
        let normalized = streamPath.hasPrefix("/") ? String(streamPath.dropFirst()) : streamPath
        return apiClient.makeURL(path: normalized)
    }

    private func idempotencyHeaders(_ key: String?) -> [String: String] {
        guard let key, !key.isEmpty else {
            return [:]
        }
        return ["Idempotency-Key": key]
    }
}
