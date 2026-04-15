import Foundation

public protocol DiscussionRepository {
    func listChannels(language: String) async throws -> [DiscussionChannelDTO]
    func listChannels() async throws -> [DiscussionChannelDTO]
    func listMessages(channelId: String, language: String, limit: Int, before: String?) async throws -> DiscussionMessagesResponseDTO
    func listMessages(channelId: String) async throws -> DiscussionMessagesResponseDTO
    func postMessage(channelId: String, text: String, language: String, replyToMessageId: String?) async throws -> DiscussionMessageDTO
    func postMessage(channelId: String, text: String) async throws -> DiscussionMessageDTO
    func deleteMessage(channelId: String, messageId: String, language: String) async throws
    func createChannel(language: String, title: String, description: String, key: String?) async throws -> DiscussionChannelDTO
    func deleteChannel(channelId: String, language: String) async throws
}

public final class DiscussionRepositoryImpl: DiscussionRepository {
    private let authService: AuthService

    public init(authService: AuthService) {
        self.authService = authService
    }

    public func listChannels(language: String = "en") async throws -> [DiscussionChannelDTO] {
        let response: DiscussionChannelsResponseDTO = try await authService.authenticatedGet(
            path: "api/v1/discussions/channels",
            queryParams: ["lang": language]
        )
        return response.channels
    }

    public func listChannels() async throws -> [DiscussionChannelDTO] {
        try await listChannels(language: "en")
    }

    public func listMessages(
        channelId: String,
        language: String = "en",
        limit: Int = 100,
        before: String? = nil
    ) async throws -> DiscussionMessagesResponseDTO {
        var params: [String: String] = ["limit": String(limit)]
        if let before, !before.isEmpty {
            params["before"] = before
        }

        return try await authService.authenticatedGet(
            path: "api/v1/discussions/\(language)/\(channelId)/messages",
            queryParams: params
        )
    }

    public func listMessages(channelId: String) async throws -> DiscussionMessagesResponseDTO {
        try await listMessages(channelId: channelId, language: "en", limit: 100, before: nil)
    }

    public func postMessage(
        channelId: String,
        text: String,
        language: String = "en",
        replyToMessageId: String? = nil
    ) async throws -> DiscussionMessageDTO {
        struct PostMessagePayload: Encodable {
            let body: String
            let replyToMessageId: String?
        }

        return try await authService.authenticatedPost(
            path: "api/v1/discussions/\(language)/\(channelId)/messages",
            body: PostMessagePayload(body: text, replyToMessageId: replyToMessageId)
        )
    }

    public func postMessage(channelId: String, text: String) async throws -> DiscussionMessageDTO {
        try await postMessage(channelId: channelId, text: text, language: "en", replyToMessageId: nil)
    }

    public func deleteMessage(channelId: String, messageId: String, language: String = "en") async throws {
        try await authService.authenticatedDelete(path: "api/v1/discussions/\(language)/\(channelId)/messages/\(messageId)")
    }

    public func createChannel(
        language: String,
        title: String,
        description: String,
        key: String?
    ) async throws -> DiscussionChannelDTO {
        struct CreateChannelPayload: Encodable {
            let lang: String
            let title: String
            let description: String
            let key: String?
        }

        return try await authService.authenticatedPost(
            path: "api/v1/discussions/channels",
            body: CreateChannelPayload(lang: language, title: title, description: description, key: key)
        )
    }

    public func deleteChannel(channelId: String, language: String) async throws {
        try await authService.authenticatedDelete(path: "api/v1/discussions/\(language)/\(channelId)")
    }
}
