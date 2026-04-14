import Foundation
import SwiftUI
#if canImport(UIKit)
import UIKit
private typealias PlatformImage = UIImage
#elseif canImport(AppKit)
import AppKit
private typealias PlatformImage = NSImage
#endif

struct RemoteCoverImageView: View {
    let url: URL?
    let fallbackText: String
    let fallbackFontSize: CGFloat
    var backgroundColor: Color = Branding.surface

    @State private var phase: Phase = .idle

    var body: some View {
        ZStack {
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .clipped()
            case .loading:
                ZStack {
                    backgroundColor
                    ProgressView()
                        .controlSize(.small)
                        .tint(Branding.accent)
                }
            case .idle, .failure:
                ZStack {
                    backgroundColor
                    Text(fallbackText)
                        .font(.system(size: fallbackFontSize, weight: .bold))
                        .foregroundStyle(Branding.accent)
                }
            }
        }
        .task(id: url?.absoluteString) {
            await load()
        }
    }

    @MainActor
    private func load() async {
        guard let url else {
            phase = .failure
            return
        }

        if let cached = await RemoteCoverStore.shared.cachedImage(for: url) {
            phase = .success(renderImage(from: cached))
            return
        }

        phase = .loading

        if let loaded = await RemoteCoverStore.shared.loadImage(for: url) {
            phase = .success(renderImage(from: loaded))
        } else if Task.isCancelled {
            phase = .idle
        } else {
            phase = .failure
        }
    }

    private func renderImage(from image: PlatformImage) -> Image {
        #if canImport(UIKit)
        return Image(uiImage: image)
        #elseif canImport(AppKit)
        return Image(nsImage: image)
        #else
        return Image(systemName: "book")
        #endif
    }

    private enum Phase {
        case idle
        case loading
        case success(Image)
        case failure
    }
}

private actor RemoteCoverStore {
    static let shared = RemoteCoverStore()

    private let cache = NSCache<NSURL, PlatformImage>()
    private var inFlight: [URL: Task<PlatformImage?, Never>] = [:]

    init() {
        cache.countLimit = 500
        cache.totalCostLimit = 80 * 1024 * 1024
    }

    func cachedImage(for url: URL) -> PlatformImage? {
        cache.object(forKey: url as NSURL)
    }

    func loadImage(for url: URL) async -> PlatformImage? {
        if let cached = cache.object(forKey: url as NSURL) {
            return cached
        }

        if let task = inFlight[url] {
            return await task.value
        }

        let task = Task<PlatformImage?, Never> {
            var request = URLRequest(url: url)
            request.cachePolicy = .returnCacheDataElseLoad
            request.timeoutInterval = 25

            do {
                let (data, response) = try await URLSession.shared.data(for: request)
                guard !Task.isCancelled else { return nil }

                if let httpResponse = response as? HTTPURLResponse,
                   !(200 ... 299).contains(httpResponse.statusCode) {
                    return nil
                }

                #if canImport(UIKit)
                return PlatformImage(data: data)
                #elseif canImport(AppKit)
                return PlatformImage(data: data)
                #else
                return nil
                #endif
            } catch {
                return nil
            }
        }

        inFlight[url] = task
        let image = await task.value
        if let image {
            cache.setObject(image, forKey: url as NSURL)
        }
        inFlight[url] = nil
        return image
    }
}
