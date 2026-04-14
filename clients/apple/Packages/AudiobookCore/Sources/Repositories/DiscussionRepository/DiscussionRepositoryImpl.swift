import Foundation

public protocol DiscussionRepository {
    func listChannels(language: String) async throws -> [DiscussionChannelDTO]
    func listChannels() async throws -> [DiscussionChannelDTO]
    func listMessages(channelId: String, language: String, limit: Int, offset: Int) async throws -> [DiscussionMessageDTO]
    func listMessages(channelId: String) async throws -> [DiscussionMessageDTO]
    func postMessage(channelId: String, text: String, language: String) async throws -> DiscussionMessageDTO
    func postMessage(channelId: String, text: String) async throws -> DiscussionMessageDTO
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

    public func listMessages(channelId: String, language: String = "en", limit: Int = 100, offset: Int = 0) async throws -> [DiscussionMessageDTO] {
        let response: DiscussionMessagesResponseDTO = try await authService.authenticatedGet(
            path: "api/v1/discussions/\(language)/\(channelId)/messages",
            queryParams: ["limit": String(limit)]
        )
        return response.messages
    }

    public func listMessages(channelId: String) async throws -> [DiscussionMessageDTO] {
        try await listMessages(channelId: channelId, language: "en", limit: 100, offset: 0)
    }

    public func postMessage(channelId: String, text: String, language: String = "en") async throws -> DiscussionMessageDTO {
        struct PostMessagePayload: Encodable {
            let body: String
            let replyToMessageId: String?
        }

        return try await authService.authenticatedPost(
            path: "api/v1/discussions/\(language)/\(channelId)/messages",
            body: PostMessagePayload(body: text, replyToMessageId: nil)
        )
    }

    public func postMessage(channelId: String, text: String) async throws -> DiscussionMessageDTO {
        try await postMessage(channelId: channelId, text: text, language: "en")
    }
}
