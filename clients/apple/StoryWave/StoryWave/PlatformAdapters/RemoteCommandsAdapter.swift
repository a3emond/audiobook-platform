import Foundation
import MediaPlayer
import AudiobookCore
import ImageIO

#if canImport(UIKit)
import UIKit
private typealias PlatformImage = UIImage
#elseif canImport(AppKit)
import AppKit
private typealias PlatformImage = NSImage
#endif

/*
 Purpose:
 Bridge app playback state to system media controls and now-playing surfaces.

 Clarification:
 "Remote" here means OS-level media controls (Control Center, lock screen, headset keys,
 keyboard media keys). It does not mean controlling playback on another device.
*/
/// Implementation of RemoteCommandsAdapter for iOS and macOS.
/// Manages MPRemoteCommandCenter, now playing metadata, and artwork display.
@MainActor
final class RemoteCommandsAdapterImpl: RemoteCommandsAdapter {
    // MARK: Dependencies

    weak var playerActions: PlayerRemoteCommandActions?
    let authService: AuthService
    let repositoryStreamURLProvider: (String) -> URL

    // MARK: State

    private var remoteCommandsConfigured = false
    private var playCommandTarget: Any?
    private var pauseCommandTarget: Any?
    private var skipForwardCommandTarget: Any?
    private var skipBackwardCommandTarget: Any?
    private var nextTrackCommandTarget: Any?
    private var previousTrackCommandTarget: Any?
    private var lastArtworkBookId: String?
    private var artworkLoadingBookId: String?
    private var artworkTask: Task<Void, Never>?

    // MARK: Initialization

    init(
        playerActions: PlayerRemoteCommandActions?,
        authService: AuthService,
        repositoryStreamURLProvider: @escaping (String) -> URL
    ) {
        self.playerActions = playerActions
        self.authService = authService
        self.repositoryStreamURLProvider = repositoryStreamURLProvider
    }

    // MARK: RemoteCommandsAdapter Protocol

    func configureRemoteCommandsIfNeeded() {
        guard !remoteCommandsConfigured else { return }
        remoteCommandsConfigured = true

        let center = MPRemoteCommandCenter.shared()
        center.playCommand.isEnabled = true
        center.pauseCommand.isEnabled = true
        center.skipForwardCommand.isEnabled = true
        center.skipBackwardCommand.isEnabled = true
        center.nextTrackCommand.isEnabled = true
        center.previousTrackCommand.isEnabled = true

        playCommandTarget = center.playCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.playerActions?.playPressed()
            return .success
        }
        pauseCommandTarget = center.pauseCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.playerActions?.pausePressed()
            return .success
        }
        skipForwardCommandTarget = center.skipForwardCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.playerActions?.handleSkipForwardMediaAction()
            return .success
        }
        skipBackwardCommandTarget = center.skipBackwardCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.playerActions?.handleSkipBackwardMediaAction()
            return .success
        }
        nextTrackCommandTarget = center.nextTrackCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.playerActions?.handleSkipForwardMediaAction()
            return .success
        }
        previousTrackCommandTarget = center.previousTrackCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.playerActions?.handleSkipBackwardMediaAction()
            return .success
        }
    }

    func removeRemoteCommandTargets() {
        guard remoteCommandsConfigured else { return }
        let center = MPRemoteCommandCenter.shared()
        if let t = playCommandTarget { center.playCommand.removeTarget(t) }
        if let t = pauseCommandTarget { center.pauseCommand.removeTarget(t) }
        if let t = skipForwardCommandTarget { center.skipForwardCommand.removeTarget(t) }
        if let t = skipBackwardCommandTarget { center.skipBackwardCommand.removeTarget(t) }
        if let t = nextTrackCommandTarget { center.nextTrackCommand.removeTarget(t) }
        if let t = previousTrackCommandTarget { center.previousTrackCommand.removeTarget(t) }
        playCommandTarget = nil
        pauseCommandTarget = nil
        skipForwardCommandTarget = nil
        skipBackwardCommandTarget = nil
        nextTrackCommandTarget = nil
        previousTrackCommandTarget = nil
        remoteCommandsConfigured = false
    }

    func updateNowPlayingInfo(
        title: String,
        author: String?,
        duration: TimeInterval,
        position: TimeInterval,
        playbackRate: Double,
        isPlaying: Bool,
        coverURL: String?,
        chapterTitle: String?,
        chapterNumber: Int?,
        forwardJumpSeconds: Double,
        backwardJumpSeconds: Double
    ) {
        guard !title.isEmpty else {
            clearNowPlayingInfo()
            return
        }

        let existingNowPlaying = MPNowPlayingInfoCenter.default().nowPlayingInfo
        let existingArtwork = existingNowPlaying?[MPMediaItemPropertyArtwork]

        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: author ?? "Unknown author",
            MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
            MPMediaItemPropertyPlaybackDuration: max(duration, 0),
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? playbackRate : 0,
        ]

        if let existingArtwork {
            info[MPMediaItemPropertyArtwork] = existingArtwork
        }

        if let chapterTitle {
            info[MPMediaItemPropertyAlbumTitle] = chapterTitle
        }

        if let chapterNumber {
            info[MPNowPlayingInfoPropertyChapterNumber] = chapterNumber
        }

        let center = MPRemoteCommandCenter.shared()
        center.skipForwardCommand.preferredIntervals = [NSNumber(value: forwardJumpSeconds)]
        center.skipBackwardCommand.preferredIntervals = [NSNumber(value: backwardJumpSeconds)]

        MPNowPlayingInfoCenter.default().nowPlayingInfo = info

        #if os(macOS)
        MPNowPlayingInfoCenter.default().playbackState = isPlaying ? .playing : .paused
        #endif

        loadNowPlayingArtworkIfNeeded(with: coverURL)
    }

    func clearNowPlayingInfo() {
        lastArtworkBookId = nil
        artworkLoadingBookId = nil
        artworkTask?.cancel()
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil

        #if os(macOS)
        MPNowPlayingInfoCenter.default().playbackState = .stopped
        #endif
    }

    func updateNowPlayingArtwork(_ artwork: MPMediaItemArtwork) {
        var nowPlaying = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        nowPlaying[MPMediaItemPropertyArtwork] = artwork
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlaying
    }

    // MARK: Artwork Loading

    private func loadNowPlayingArtworkIfNeeded(with bookId: String?) {
        guard let bookId, !bookId.isEmpty else { return }
        guard lastArtworkBookId != bookId else { return }
        guard artworkLoadingBookId != bookId else { return }

        artworkLoadingBookId = bookId
        artworkTask?.cancel()

        artworkTask = Task { [weak self] in
            guard let self, !Task.isCancelled else { return }

            guard !Task.isCancelled,
                  let artwork = await self.fetchNowPlayingArtwork(bookId: bookId)
            else {
                await MainActor.run {
                    if self.artworkLoadingBookId == bookId {
                        self.artworkLoadingBookId = nil
                    }
                }
                return
            }

            guard !Task.isCancelled else { return }

            await MainActor.run {
                self.updateNowPlayingArtwork(artwork)
                self.lastArtworkBookId = bookId
                if self.artworkLoadingBookId == bookId {
                    self.artworkLoadingBookId = nil
                }
            }
        }
    }

    private func fetchNowPlayingArtwork(bookId: String) async -> MPMediaItemArtwork? {
        let baseCoverURL = repositoryStreamURLProvider("streaming/books/\(bookId)/cover")
        let authenticatedString = authenticatedMediaURLString(for: "streaming/books/\(bookId)/cover")

        let candidateURLs: [URL] = [
            URL(string: authenticatedString),
            baseCoverURL,
        ].compactMap { $0 }

        for url in candidateURLs {
            if Task.isCancelled { return nil }
            if let data = await fetchArtworkData(from: url),
               let artwork = makeNowPlayingArtwork(from: data) {
                return artwork
            }
        }

        return fallbackNowPlayingArtwork()
    }

    private func fetchArtworkData(from url: URL) async -> Data? {
        var request = URLRequest(url: url)
        request.cachePolicy = .returnCacheDataElseLoad
        request.timeoutInterval = 25

        if let token = authService.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse,
              (200...299).contains(http.statusCode),
              !data.isEmpty else {
            return nil
        }
        return data
    }

    private func makeNowPlayingArtwork(from data: Data) -> MPMediaItemArtwork? {
        guard let image = decodePlatformImage(from: data) else { return nil }
        return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }

    private func decodePlatformImage(from data: Data) -> PlatformImage? {
        if let direct = PlatformImage(data: data) {
            return direct
        }

        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            return nil
        }

        #if canImport(UIKit)
        return PlatformImage(cgImage: cgImage)
        #elseif canImport(AppKit)
        return PlatformImage(cgImage: cgImage, size: .zero)
        #else
        return nil
        #endif
    }

    private func fallbackNowPlayingArtwork() -> MPMediaItemArtwork? {
        let size = CGSize(width: 256, height: 256)
        #if canImport(UIKit)
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { ctx in
            UIColor(red: 0.16, green: 0.23, blue: 0.35, alpha: 1).setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
        return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        #elseif canImport(AppKit)
        let image = PlatformImage(size: size)
        image.lockFocus()
        NSColor(calibratedRed: 0.16, green: 0.23, blue: 0.35, alpha: 1).setFill()
        NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()
        image.unlockFocus()
        return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        #else
        return nil
        #endif
    }

    private func authenticatedMediaURLString(for path: String) -> String {
        guard let token = authService.accessToken else {
            return repositoryStreamURLProvider(path).absoluteString
        }
        let base = repositoryStreamURLProvider(path).absoluteString
        let separator = base.contains("?") ? "&" : "?"
        return "\(base)\(separator)token=\(token)"
    }
}

/// Actions exposed by the player to respond to system media-control events.
@MainActor
protocol PlayerRemoteCommandActions: AnyObject {
    func playPressed()
    func pausePressed()
    func handleSkipForwardMediaAction()
    func handleSkipBackwardMediaAction()
}
