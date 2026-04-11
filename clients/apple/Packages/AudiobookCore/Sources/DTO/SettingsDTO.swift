import Foundation

public struct UserSettingsDTO: Decodable {
    public let locale: String?
    public let player: PlayerSettingsDTO
}

public struct PlayerSettingsDTO: Decodable {
    public let forwardJumpSeconds: Int?
    public let backwardJumpSeconds: Int?
    public let playbackRate: Double?
    public let resumeRewind: ResumeRewindSettingsDTO?
}

public struct ResumeRewindSettingsDTO: Decodable {
    public let enabled: Bool?
    public let thresholdSinceLastListenSeconds: Int?
    public let rewindSeconds: Int?
}
