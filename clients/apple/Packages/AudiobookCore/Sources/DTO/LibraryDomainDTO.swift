import Foundation

public struct CollectionDTO: Codable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let bookIds: [String]
    public let createdAt: String?
    public let updatedAt: String?
}

public struct CollectionsPageDTO: Decodable, Sendable {
    public let collections: [CollectionDTO]
    public let total: Int
    public let limit: Int?
    public let offset: Int?
}

public struct UpsertCollectionRequestDTO: Encodable, Sendable {
    public let name: String
    public let bookIds: [String]

    public init(name: String, bookIds: [String]) {
        self.name = name
        self.bookIds = bookIds
    }
}

public struct SeriesDetailDTO: Codable, Sendable {
    public let series: String
    public let books: [BookDTO]
}

public struct ProgressRecordDTO: Codable, Identifiable, Sendable {
    public var id: String { bookId }

    public let bookId: String
    public let positionSeconds: Int
    public let durationAtSave: Int
    public let completed: Bool
    public let lastListenedAt: String?
    public let updatedAt: String?
}

public struct ProgressPageDTO: Decodable, Sendable {
    public let progress: [ProgressRecordDTO]
    public let total: Int
    public let limit: Int
    public let offset: Int
    public let hasMore: Bool
}

public struct SaveProgressPayloadDTO: Encodable, Sendable {
    public let positionSeconds: Int
    public let durationAtSave: Int
    public let lastChapterIndex: Int?
    public let secondsIntoChapter: Int?

    public init(
        positionSeconds: Int,
        durationAtSave: Int,
        lastChapterIndex: Int? = nil,
        secondsIntoChapter: Int? = nil
    ) {
        self.positionSeconds = positionSeconds
        self.durationAtSave = durationAtSave
        self.lastChapterIndex = lastChapterIndex
        self.secondsIntoChapter = secondsIntoChapter
    }
}

public struct UserStatsDTO: Decodable, Sendable {
    public struct LifetimeDTO: Decodable, Sendable {
        public let totalListeningSeconds: Int
        public let completedBooksCount: Int
        public let distinctBooksStarted: Int
        public let distinctBooksCompleted: Int
        public let totalSessions: Int
    }

    public struct RollingDTO: Decodable, Sendable {
        public let last7DaysListeningSeconds: Int
        public let last30DaysListeningSeconds: Int
    }

    public let lifetime: LifetimeDTO
    public let rolling: RollingDTO
}

public struct ListeningSessionDTO: Codable, Identifiable, Sendable {
    public let id: String
    public let bookId: String
    public let startedAt: String
    public let endedAt: String
    public let listenedSeconds: Int
    public let startPositionSeconds: Int
    public let endPositionSeconds: Int
    public let device: String?
}

public struct SessionsPageDTO: Decodable, Sendable {
    public let sessions: [ListeningSessionDTO]
    public let total: Int
    public let limit: Int
    public let offset: Int
    public let hasMore: Bool
}

public struct CreateSessionPayloadDTO: Encodable, Sendable {
    public let bookId: String
    public let startedAt: String
    public let endedAt: String
    public let listenedSeconds: Int
    public let startPositionSeconds: Int
    public let endPositionSeconds: Int
    public let device: String?

    public init(
        bookId: String,
        startedAt: String,
        endedAt: String,
        listenedSeconds: Int,
        startPositionSeconds: Int,
        endPositionSeconds: Int,
        device: String? = nil
    ) {
        self.bookId = bookId
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.listenedSeconds = listenedSeconds
        self.startPositionSeconds = startPositionSeconds
        self.endPositionSeconds = endPositionSeconds
        self.device = device
    }
}

public struct SettingsDTO: Codable, Sendable {
    public struct PlayerDTO: Codable, Sendable {
        public struct ResumeRewindDTO: Codable, Sendable {
            public let enabled: Bool?
            public let thresholdSinceLastListenSeconds: Int?
            public let rewindSeconds: Int?

            public init(enabled: Bool?, thresholdSinceLastListenSeconds: Int?, rewindSeconds: Int?) {
                self.enabled = enabled
                self.thresholdSinceLastListenSeconds = thresholdSinceLastListenSeconds
                self.rewindSeconds = rewindSeconds
            }
        }

        public let forwardJumpSeconds: Int?
        public let backwardJumpSeconds: Int?
        public let playbackRate: Double?
        public let sleepTimerMode: String?
        public let resumeRewind: ResumeRewindDTO?

        public init(
            forwardJumpSeconds: Int?,
            backwardJumpSeconds: Int?,
            playbackRate: Double?,
            sleepTimerMode: String?,
            resumeRewind: ResumeRewindDTO?
        ) {
            self.forwardJumpSeconds = forwardJumpSeconds
            self.backwardJumpSeconds = backwardJumpSeconds
            self.playbackRate = playbackRate
            self.sleepTimerMode = sleepTimerMode
            self.resumeRewind = resumeRewind
        }
    }

    public struct LibraryDTO: Codable, Sendable {
        public let completionThresholdPercent: Int?
        public let showCompleted: Bool?

        public init(completionThresholdPercent: Int?, showCompleted: Bool?) {
            self.completionThresholdPercent = completionThresholdPercent
            self.showCompleted = showCompleted
        }
    }

    public let locale: String?
    public let player: PlayerDTO
    public let library: LibraryDTO?
}

public struct UpdateSettingsPayloadDTO: Encodable, Sendable {
    public let locale: String?
    public let player: SettingsDTO.PlayerDTO?
    public let library: SettingsDTO.LibraryDTO?

    public init(locale: String? = nil, player: SettingsDTO.PlayerDTO? = nil, library: SettingsDTO.LibraryDTO? = nil) {
        self.locale = locale
        self.player = player
        self.library = library
    }
}
