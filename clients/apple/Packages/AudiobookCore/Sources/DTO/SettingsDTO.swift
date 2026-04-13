import Foundation

public struct UserSettingsDTO: Decodable {
    public let locale: String?
    public let player: PlayerSettingsDTO

    public init(locale: String?, player: PlayerSettingsDTO) {
        self.locale = locale
        self.player = player
    }
}

public struct PlayerSettingsDTO: Decodable {
    public let forwardJumpSeconds: Int?
    public let backwardJumpSeconds: Int?
    public let playbackRate: Double?
    public let resumeRewind: ResumeRewindSettingsDTO?

    public init(
        forwardJumpSeconds: Int?,
        backwardJumpSeconds: Int?,
        playbackRate: Double?,
        resumeRewind: ResumeRewindSettingsDTO?
    ) {
        self.forwardJumpSeconds = forwardJumpSeconds
        self.backwardJumpSeconds = backwardJumpSeconds
        self.playbackRate = playbackRate
        self.resumeRewind = resumeRewind
    }
}

public struct ResumeRewindSettingsDTO: Decodable {
    public let enabled: Bool?
    public let thresholdSinceLastListenSeconds: Int?
    public let rewindSeconds: Int?

    public init(enabled: Bool?, thresholdSinceLastListenSeconds: Int?, rewindSeconds: Int?) {
        self.enabled = enabled
        self.thresholdSinceLastListenSeconds = thresholdSinceLastListenSeconds
        self.rewindSeconds = rewindSeconds
    }
}
