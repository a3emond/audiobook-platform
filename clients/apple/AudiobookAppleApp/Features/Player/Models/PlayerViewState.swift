import Foundation
import AudiobookCore

struct PlayerViewState {
    var bookId: String = ""
    var title: String = ""
    var author: String?
    var coverPath: String?
    var streamPath: String?
    var streamURLString: String?
    var startSeconds: Double = 0
    var durationSeconds: Double = 0
    var positionSeconds: Double = 0
    var backwardJumpSeconds: Double = 10
    var forwardJumpSeconds: Double = 30
    var playbackRate: Double = 1
    var appliedRewind: Bool = false
    var chapters: [PlayerChapterDTO] = []
    var currentChapterIndex: Int = 0
    var isPlaying: Bool = false
    var activeDeviceLabel: String?
    var isLoading: Bool = false
    var isSaving: Bool = false
    var errorMessage: String?
}
