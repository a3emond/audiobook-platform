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

// MARK: - Media Center (NowPlaying + Remote Commands)

extension PlayerViewModel {

    // MARK: Now Playing Info

    func updateNowPlayingInfo() {
        guard !state.bookId.isEmpty else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }

        let existingNowPlaying = MPNowPlayingInfoCenter.default().nowPlayingInfo
        let existingArtwork = existingNowPlaying?[MPMediaItemPropertyArtwork]

        var info: [String: Any] = [
            MPMediaItemPropertyTitle:                    state.title,
            MPMediaItemPropertyArtist:                   state.author ?? "Unknown author",
            MPNowPlayingInfoPropertyElapsedPlaybackTime: state.positionSeconds,
            MPMediaItemPropertyPlaybackDuration:         max(state.durationSeconds, 0),
            MPNowPlayingInfoPropertyPlaybackRate:        state.isPlaying ? state.playbackRate : 0,
        ]

        if let existingArtwork {
            info[MPMediaItemPropertyArtwork] = existingArtwork
        } else if let fallback = fallbackNowPlayingArtwork() {
            info[MPMediaItemPropertyArtwork] = fallback
        }

        if let chapter = state.chapters[safe: state.currentChapterIndex] {
            info[MPNowPlayingInfoPropertyChapterNumber] = chapter.index + 1
            info[MPMediaItemPropertyAlbumTitle]         = chapter.title
        }

        MPRemoteCommandCenter.shared().skipForwardCommand.preferredIntervals  = [NSNumber(value: state.forwardJumpSeconds)]
        MPRemoteCommandCenter.shared().skipBackwardCommand.preferredIntervals = [NSNumber(value: state.backwardJumpSeconds)]
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        #if os(macOS)
        MPNowPlayingInfoCenter.default().playbackState = state.isPlaying ? .playing : .paused
        #endif
        loadNowPlayingArtworkIfNeeded()
    }

    func clearNowPlayingInfo() {
        lastArtworkBookId = nil
        artworkLoadingBookId = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        #if os(macOS)
        MPNowPlayingInfoCenter.default().playbackState = .stopped
        #endif
    }

    // MARK: Artwork Loading

    func loadNowPlayingArtworkIfNeeded() {
        guard !state.bookId.isEmpty else { return }
        guard lastArtworkBookId != state.bookId else { return }
        guard artworkLoadingBookId != state.bookId else { return }

        let requestedBookId = state.bookId
        artworkLoadingBookId = requestedBookId
        artworkTask?.cancel()

        artworkTask = Task { [weak self] in
            guard let self, !Task.isCancelled else { return }

            guard !Task.isCancelled,
                  let artwork = await self.fetchNowPlayingArtwork(bookId: requestedBookId)
            else {
                await MainActor.run {
                    if self.artworkLoadingBookId == requestedBookId {
                        self.artworkLoadingBookId = nil
                    }
                }
                return
            }

            guard !Task.isCancelled else { return }

            await MainActor.run {
                guard self.state.bookId == requestedBookId else { return }
                var nowPlaying = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
                nowPlaying[MPMediaItemPropertyArtwork] = artwork
                MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlaying
                self.lastArtworkBookId = requestedBookId
                if self.artworkLoadingBookId == requestedBookId {
                    self.artworkLoadingBookId = nil
                }
            }
        }
    }

    // MARK: Remote Commands

    func configureRemoteCommandsIfNeeded() {
        guard !remoteCommandsConfigured else { return }
        remoteCommandsConfigured = true

        let center = MPRemoteCommandCenter.shared()
        center.playCommand.isEnabled         = true
        center.pauseCommand.isEnabled        = true
        center.skipForwardCommand.isEnabled  = true
        center.skipBackwardCommand.isEnabled = true
        center.nextTrackCommand.isEnabled    = true
        center.previousTrackCommand.isEnabled = true
        center.skipForwardCommand.preferredIntervals  = [NSNumber(value: state.forwardJumpSeconds)]
        center.skipBackwardCommand.preferredIntervals = [NSNumber(value: state.backwardJumpSeconds)]

        playCommandTarget = center.playCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.playPressed()
            return .success
        }
        pauseCommandTarget = center.pauseCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.pausePressed()
            return .success
        }
        skipForwardCommandTarget = center.skipForwardCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.handleSkipForwardMediaAction()
            return .success
        }
        skipBackwardCommandTarget = center.skipBackwardCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.handleSkipBackwardMediaAction()
            return .success
        }
        nextTrackCommandTarget = center.nextTrackCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.handleSkipForwardMediaAction()
            return .success
        }
        previousTrackCommandTarget = center.previousTrackCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.handleSkipBackwardMediaAction()
            return .success
        }
    }

    func removeRemoteCommandTargets() {
        guard remoteCommandsConfigured else { return }
        let center = MPRemoteCommandCenter.shared()
        if let t = playCommandTarget          { center.playCommand.removeTarget(t) }
        if let t = pauseCommandTarget         { center.pauseCommand.removeTarget(t) }
        if let t = skipForwardCommandTarget   { center.skipForwardCommand.removeTarget(t) }
        if let t = skipBackwardCommandTarget  { center.skipBackwardCommand.removeTarget(t) }
        if let t = nextTrackCommandTarget     { center.nextTrackCommand.removeTarget(t) }
        if let t = previousTrackCommandTarget { center.previousTrackCommand.removeTarget(t) }
        nextTrackCommandTarget = nil
        previousTrackCommandTarget = nil
        remoteCommandsConfigured = false
    }

    // MARK: Private – Artwork Factories

    private func fetchNowPlayingArtwork(bookId: String) async -> MPMediaItemArtwork? {
        let baseCoverURL = repository.streamURL(streamPath: "streaming/books/\(bookId)/cover")
        let authenticatedString = authenticatedMediaURLString(for: "streaming/books/\(bookId)/cover")

        let candidateURLs: [URL] = [
            URL(string: state.coverURLString ?? ""),
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

        return nil
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
}
