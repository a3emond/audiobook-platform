import Foundation

private enum JSONValue: Codable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch self {
        case .string(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }

    var displayString: String? {
        switch self {
        case .string(let value):
            return value
        case .number(let value):
            return value.formatted()
        case .bool(let value):
            return value ? "true" : "false"
        case .object(let value):
            return JSONValue.serializedString(from: value)
        case .array(let value):
            return JSONValue.serializedString(from: value)
        case .null:
            return nil
        }
    }

    private static func serializedString<T: Encodable>(from value: T) -> String? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]

        guard let data = try? encoder.encode(value) else {
            return nil
        }

        return String(data: data, encoding: .utf8)
    }
}

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
    public let tags: [String]?
    public let language: String?

    public init(
        title: String? = nil,
        author: String? = nil,
        series: String? = nil,
        seriesIndex: Int? = nil,
        genre: String? = nil,
        description: String? = nil,
        tags: [String]? = nil,
        language: String? = nil
    ) {
        self.title = title
        self.author = author
        self.series = series
        self.seriesIndex = seriesIndex
        self.genre = genre
        self.description = description
        self.tags = tags
        self.language = language
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
    public let attempt: Int?
    public let maxAttempts: Int?
    public let priority: Int?
    public let runAfter: String?
    public let startedAt: String?
    public let finishedAt: String?
    public let createdAt: String?
    public let updatedAt: String?
}

// MARK: - Worker Settings

public struct WorkerQueueSettingsDTO: Codable, Sendable {
    public let heavyJobTypes: [String]?
    public let heavyJobDelayMs: Int?
    public let heavyWindowEnabled: Bool?
    public let heavyWindowStart: String?
    public let heavyWindowEnd: String?
    public let heavyConcurrency: Int?
    public let fastConcurrency: Int?

    public init(
        heavyJobTypes: [String]? = nil,
        heavyJobDelayMs: Int? = nil,
        heavyWindowEnabled: Bool? = nil,
        heavyWindowStart: String? = nil,
        heavyWindowEnd: String? = nil,
        heavyConcurrency: Int? = nil,
        fastConcurrency: Int? = nil
    ) {
        self.heavyJobTypes = heavyJobTypes
        self.heavyJobDelayMs = heavyJobDelayMs
        self.heavyWindowEnabled = heavyWindowEnabled
        self.heavyWindowStart = heavyWindowStart
        self.heavyWindowEnd = heavyWindowEnd
        self.heavyConcurrency = heavyConcurrency
        self.fastConcurrency = fastConcurrency
    }
}

public struct WorkerParitySettingsDTO: Codable, Sendable {
    public let enabled: Bool?
    public let intervalMs: Int?

    public init(enabled: Bool? = nil, intervalMs: Int? = nil) {
        self.enabled = enabled
        self.intervalMs = intervalMs
    }
}

public struct WorkerSettingsDTO: Codable, Sendable {
    public let queue: WorkerQueueSettingsDTO?
    public let parity: WorkerParitySettingsDTO?

    public init(queue: WorkerQueueSettingsDTO? = nil, parity: WorkerParitySettingsDTO? = nil) {
        self.queue = queue
        self.parity = parity
    }
}

public struct UpdateWorkerSettingsPayloadDTO: Encodable, Sendable {
    public let queue: WorkerQueueSettingsDTO?
    public let parity: WorkerParitySettingsDTO?

    public init(queue: WorkerQueueSettingsDTO? = nil, parity: WorkerParitySettingsDTO? = nil) {
        self.queue = queue
        self.parity = parity
    }
}

// MARK: - Job Logs

public struct JobLogDTO: Decodable, Sendable {
    public let timestamp: String
    public let level: String
    public let message: String
    public let context: String?
    public let duration: Double?

    private enum CodingKeys: String, CodingKey {
        case timestamp
        case level
        case message
        case context
        case duration
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        timestamp = try container.decode(String.self, forKey: .timestamp)
        level = try container.decode(String.self, forKey: .level)
        message = try container.decode(String.self, forKey: .message)
        duration = try container.decodeIfPresent(Double.self, forKey: .duration)
        context = try container.decodeIfPresent(JSONValue.self, forKey: .context)?.displayString
    }

    public var id: String { timestamp + message }
}

public struct JobLogsPageDTO: Decodable, Sendable {
    public let jobId: String
    public let logs: [JobLogDTO]
    public let total: Int
    public let limit: Int
    public let offset: Int
}

// MARK: - Enqueue Job

public struct EnqueueJobPayloadDTO: Encodable, Sendable {
    public let trigger: String
    public let force: Bool?

    public init(trigger: String = "manual-admin", force: Bool? = nil) {
        self.trigger = trigger
        self.force = force
    }
}

public struct EnqueueJobRequestDTO: Encodable, Sendable {
    public let type: String
    public let payload: EnqueueJobPayloadDTO

    public init(type: String, force: Bool? = nil) {
        self.type = type
        self.payload = EnqueueJobPayloadDTO(trigger: "manual-admin", force: force)
    }
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
    public let hasMore: Bool?
}

public struct AdminUpdateUserRoleDTO: Encodable, Sendable {
    public let role: String

    public init(role: String) {
        self.role = role
    }
}

public struct AdminUserSessionDTO: Codable, Identifiable, Sendable {
    public let id: String
    public let userId: String
    public let device: String?
    public let ip: String?
    public let userAgent: String?
    public let expiresAt: String
    public let lastUsedAt: String
    public let createdAt: String?
    public let updatedAt: String?
}

public struct AdminUserSessionsPageDTO: Decodable, Sendable {
    public let sessions: [AdminUserSessionDTO]
    public let total: Int
    public let limit: Int
    public let offset: Int
    public let hasMore: Bool?
}

public struct AdminRevokeSessionsResponseDTO: Decodable, Sendable {
    public let revoked: Int
}
