import Foundation

public struct DiscussionChannelDTO: Decodable, Identifiable {
    public let key: String
    public let lang: String
    public let title: String
    public let description: String
    public let isDefault: Bool?

    public var id: String { key }
    public var displayName: String { title }
    public var languageCode: String { lang }
}

public struct DiscussionMessageDTO: Decodable, Identifiable {
    public struct AuthorDTO: Decodable {
        public let id: String
        public let displayName: String
        public let isAdmin: Bool
    }

    public let id: String
    public let channelKey: String
    public let lang: String
    public let body: String
    public let author: AuthorDTO
    public let replyToMessageId: String?
    public let createdAt: String?
    public let updatedAt: String?

    public var text: String { body }
    public var senderName: String? { author.displayName }
}

public struct DiscussionChannelsResponseDTO: Decodable {
    public let channels: [DiscussionChannelDTO]
}

public struct DiscussionMessagesResponseDTO: Decodable {
    public let messages: [DiscussionMessageDTO]
    public let hasMore: Bool
}
