import Foundation

public struct AdminOverviewDTO: Decodable, Sendable {
    public struct CountsDTO: Decodable, Sendable {
        public let users: Int
        public let books: Int
        public let collections: Int
        public let jobs: Int
    }

    public let counts: CountsDTO
    public let jobsByStatus: [String: Int]
}

public struct AdminCoverageResponseDTO: Decodable, Sendable {
    public struct EndpointDTO: Decodable, Sendable {
        public let method: String
        public let path: String
        public let description: String
    }

    public let endpoints: [EndpointDTO]
}

public struct AdminUploadJobResponseDTO: Decodable, Sendable {
    public let jobId: String
}

public struct AdminBookMetadataUpdateDTO: Encodable, Sendable {
    public let title: String?
    public let author: String?
    public let series: String?
    public let seriesIndex: Int?
    public let genre: String?
    public let description: String?

    public init(
        title: String? = nil,
        author: String? = nil,
        series: String? = nil,
        seriesIndex: Int? = nil,
        genre: String? = nil,
        description: String? = nil
    ) {
        self.title = title
        self.author = author
        self.series = series
        self.seriesIndex = seriesIndex
        self.genre = genre
        self.description = description
    }
}

public struct AdminBookChaptersUpdateDTO: Encodable, Sendable {
    public let chapters: [ChapterDTO]

    public init(chapters: [ChapterDTO]) {
        self.chapters = chapters
    }
}

public struct AdminJobDTO: Codable, Identifiable, Sendable {
    public let id: String
    public let type: String?
    public let status: String
    public let attempts: Int?
    public let maxAttempts: Int?
    public let progress: Double?
    public let payload: [String: String]?
    public let createdAt: String?
    public let updatedAt: String?
}

public struct AdminJobsPageDTO: Decodable, Sendable {
    public let jobs: [AdminJobDTO]
    public let total: Int
    public let limit: Int
    public let offset: Int
}

public struct AdminUserDTO: Codable, Identifiable, Sendable {
    public let id: String
    public let email: String
    public let role: String
    public let profile: UserProfilePayloadDTO?
    public let createdAt: String?
    public let updatedAt: String?
}

public struct UserProfilePayloadDTO: Codable, Sendable {
    public let displayName: String?
    public let preferredLocale: String?
}

public struct AdminUsersPageDTO: Decodable, Sendable {
    public let users: [AdminUserDTO]
    public let total: Int
    public let limit: Int
    public let offset: Int
}

public struct AdminUpdateUserRoleDTO: Encodable, Sendable {
    public let role: String

    public init(role: String) {
        self.role = role
    }
}
