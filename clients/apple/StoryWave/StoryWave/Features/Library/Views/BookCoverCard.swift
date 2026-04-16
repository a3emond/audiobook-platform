import SwiftUI
import AudiobookCore

struct BookCoverCard: View {
    let book: BookDTO
    let coverURL: URL?
    let progressPercent: Double?
    let isCompleted: Bool
    let isAdmin: Bool
    let onAdminEdit: () -> Void
    let onTap: () -> Void

    private let overlayDebugEnabled = true

    private var progressText: String {
        guard let progressPercent else { return "nil" }
        return String(format: "%.4f", progressPercent)
    }

    private var resolvedProgressPercent: Double? {
        if isCompleted {
            return 1
        }
        return progressPercent
    }

    private var safeCoverURLText: String {
        guard let coverURL else { return "nil" }
        guard var components = URLComponents(url: coverURL, resolvingAgainstBaseURL: false) else {
            return coverURL.absoluteString
        }

        components.queryItems = components.queryItems?.map { item in
            if item.name == "access_token" {
                return URLQueryItem(name: item.name, value: "[redacted]")
            }
            return item
        }

        return components.string ?? coverURL.absoluteString
    }

    private func logOverlayState(_ reason: String) {
        guard overlayDebugEnabled else { return }

        print(
            "[OverlayDebug][BookCard][\(reason)] " +
            "bookId=\(book.id) " +
            "title=\(book.title) " +
            "progress=\(progressText) " +
            "isCompleted=\(isCompleted) " +
            "showProgressPill=\(resolvedProgressPercent != nil) " +
            "showProgressBar=\(resolvedProgressPercent != nil) " +
            "showCompletedBadge=\(isCompleted) " +
            "isAdmin=\(isAdmin) " +
            "coverURL=\(safeCoverURLText)"
        )
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Button(action: onTap) {
                VStack(alignment: .leading, spacing: 8) {
                    BookCoverFrameView(
                        url: coverURL,
                        fallbackText: book.title.prefix(2).uppercased(),
                        fallbackFontSize: 28,
                        size: CGSize(width: 140, height: 140),
                        cornerRadius: 10
                    ) {
                        if let resolvedProgressPercent {
                            VStack(spacing: 0) {
                                Spacer()

                                BookProgressBarView(progressPercent: resolvedProgressPercent, height: 4)
                            }
                        }

                        if isCompleted {
                            BookCompletedBadgeView()
                                .padding(8)
                                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                        }
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(book.title)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(2)
                            .foregroundStyle(Branding.text)
                        if let author = book.author {
                            Text(author)
                                .font(.caption)
                                .foregroundStyle(Branding.textMuted)
                                .lineLimit(1)
                        }
                    }
                    .frame(width: 140, alignment: .leading)
                }
            }
            .buttonStyle(.plain)

            if let resolvedProgressPercent {
                BookProgressPillView(progressPercent: resolvedProgressPercent)
                    .padding(8)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .zIndex(2)
            }

            if isAdmin {
                Button("Edit") {
                    onAdminEdit()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.mini)
                .padding(6)
            }
        }
        .onAppear {
            logOverlayState("onAppear")
        }
        .onChange(of: progressPercent) { _, _ in
            logOverlayState("progressChanged")
        }
        .onChange(of: isCompleted) { _, _ in
            logOverlayState("completedChanged")
        }
    }
}
