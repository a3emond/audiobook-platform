import Foundation
import AudiobookCore

// MARK: - PlayerProgressMode

enum PlayerProgressMode: String {
    case chapter
    case book
}

// MARK: - PlayerSleepTimerMode

enum PlayerSleepTimerMode: String, CaseIterable {
    case off
    case fifteenMinutes  = "15m"
    case thirtyMinutes   = "30m"
    case fortyFiveMinutes = "45m"
    case sixtyMinutes    = "60m"
    case chapter
}

// MARK: - PlayerViewState

struct PlayerViewState {

    // MARK: Identity

    var bookId: String = ""
    var title:  String = ""
    var author: String?
    var coverPath:      String?
    var coverURLString: String?

    // MARK: Streaming

    var streamPath:      String?
    var streamURLString: String?

    // MARK: Playback Position

    var startSeconds:    Double = 0
    var durationSeconds: Double = 0
    var positionSeconds: Double = 0
    var appliedRewind:   Bool   = false

    // MARK: Player Settings

    var backwardJumpSeconds: Double = 10
    var forwardJumpSeconds:  Double = 30
    var playbackRate:        Double = 1

    // MARK: Chapters

    var chapters:            [PlayerChapterDTO] = []
    var currentChapterIndex: Int                = 0
    var progressMode:        PlayerProgressMode = .chapter

    // MARK: Book Details

    var series: String?
    var seriesIndex: Int?
    var genre: String?
    var tags: [String] = []
    var descriptionText: String?

    // MARK: Sleep Timer

    var sleepTimerMode:          PlayerSleepTimerMode = .off
    var sleepTimerCountdownText: String?

    // MARK: Playback Status

    var isPlaying:         Bool    = false
    var isCompleted:       Bool    = false
    var activeDeviceLabel: String?

    // MARK: Remote Device Presence

    var isRemotePlaybackActive: Bool   = false
    var remoteBookId:           String?
    var remoteTitle:            String?
    var remoteAuthor:           String?
    var remoteCoverURLString:   String?

    // MARK: UI State

    var isLoading:    Bool    = false
    var isSaving:     Bool    = false
    var errorMessage: String?
}
