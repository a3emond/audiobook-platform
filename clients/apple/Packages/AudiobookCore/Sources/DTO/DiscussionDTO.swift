import Foundation

public struct DiscussionChannelDTO: Decodable, Identifiable {
    public let id: String
    public let displayName: String
    public let languageCode: String

    enum CodingKeys: String, CodingKey {
        case id = "channelKey"
        case displayName
        case languageCode = "language"
    }
}

public struct DiscussionMessageDTO: Decodable, Identifiable {
    public let id: String
    public let text: String
    public let senderName: String?
    public let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id = "messageId"
        case text
        case senderName
        case createdAt
    }
}
