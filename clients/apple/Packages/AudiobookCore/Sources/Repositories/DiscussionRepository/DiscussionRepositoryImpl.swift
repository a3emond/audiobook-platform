import Foundation
import AudiobookCore

public protocol DiscussionRepository {
    func listChannels() async throws -> [DiscussionChannelDTO]
    func listMessages(channelId: String) async throws -> [DiscussionMessageDTO]
    func postMessage(channelId: String, text: String) async throws -> DiscussionMessageDTO
}

public final class DiscussionRepositoryImpl: DiscussionRepository {
    private let authService: AuthService

    public init(authService: AuthService) {
        self.authService = authService
    }

    public func listChannels() async throws -> [DiscussionChannelDTO] {
        try await authService.authenticatedGet(path: "api/v1/discussions/channels")
    }

    public func listMessages(channelId: String) async throws -> [DiscussionMessageDTO] {
        try await authService.authenticatedGet(path: "api/v1/discussions/\(channelId)/messages")
    }

    public func postMessage(channelId: String, text: String) async throws -> DiscussionMessageDTO {
        let payload: [String: String] = ["text": text]
        return try await authService.authenticatedPost(
            path: "api/v1/discussions/\(channelId)/messages",
            body: payload
        )
    }
}
