import SwiftUI
import AudiobookCore

// Compact strip variant so Continue Listening is visible without overpowering the main rails.
struct ContinueListeningStripView: View {
    typealias ContinueItem = (book: BookDTO, progress: ProgressRecordDTO)

    let items: [ContinueItem]
    let coverURLForBook: (String) -> URL?
    let isAdmin: Bool
    let onOpenBook: (String, String) -> Void
    let onEditBook: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Continue Listening")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("Resume")
                    .font(.caption2)
                    .foregroundStyle(Branding.textMuted)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 10) {
                    ForEach(items, id: \.book.id) { item in
                        ContinueListeningCardView(
                            book: item.book,
                            progress: item.progress,
                            coverURL: coverURLForBook(item.book.id),
                            isAdmin: isAdmin,
                            onAdminEdit: {
                                onEditBook(item.book.id)
                            }
                        ) {
                            onOpenBook(item.book.id, item.book.title)
                        }
                    }
                }
                .padding(.horizontal, 2)
                .padding(.bottom, 2)
            }
        }
        .padding(10)
        .background(Branding.surface.opacity(0.75))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Branding.surfaceSoft, lineWidth: 1)
        )
    }
}

private struct ContinueListeningCardView: View {
    let book: BookDTO
    let progress: ProgressRecordDTO
    let coverURL: URL?
    let isAdmin: Bool
    let onAdminEdit: () -> Void
    let onTap: () -> Void

    private let cardSize: CGFloat = 86
    private let startedProgressFallbackPercent: Double = 0.01
    private let overlayDebugEnabled = true

    private var progressPercent: Double {
        if progress.completed {
            return 1
        }

        let progressDuration = normalizedDurationSeconds(progress.durationAtSave)
        let bookDuration = normalizedDurationSeconds(book.duration)
        let duration = max(progressDuration ?? 0, bookDuration ?? 0)
        guard duration > 0 else {
            return progress.positionSeconds > 0 ? startedProgressFallbackPercent : 0
        }

        let position = normalizedDurationSeconds(progress.positionSeconds) ?? 0
        return min(1, max(0, Double(position) / Double(duration)))
    }

    private var progressText: String {
        String(format: "%.4f", progressPercent)
    }

    private var clampedProgressPercent: CGFloat {
        let raw = min(1, max(0, progressPercent))
        if raw <= 0 {
            return 0
        }
        if raw >= 1 {
            return 1
        }
        return CGFloat(max(0.01, min(0.99, raw)))
    }

    private var progressFillWidth: CGFloat {
        cardSize * clampedProgressPercent
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
            "[OverlayDebug][ContinueCard][\(reason)] " +
            "bookId=\(book.id) " +
            "title=\(book.title) " +
            "position=\(progress.positionSeconds) " +
            "durationAtSave=\(progress.durationAtSave) " +
            "completed=\(progress.completed) " +
            "progress=\(progressText) " +
            "showProgressPill=true " +
            "showProgressBar=true " +
            "isAdmin=\(isAdmin) " +
            "coverURL=\(safeCoverURLText)"
        )
    }

    private func normalizedDurationSeconds(_ rawValue: Int?) -> Int? {
        guard let rawValue, rawValue > 0 else { return nil }
        if rawValue > 200_000 {
            return max(1, rawValue / 1000)
        }
        return rawValue
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Button(action: onTap) {
                BookCoverFrameView(
                    url: coverURL,
                    fallbackText: book.title.prefix(2).uppercased(),
                    fallbackFontSize: 18,
                    size: CGSize(width: cardSize, height: cardSize),
                    cornerRadius: 10
                ) {
                    ZStack {
                        VStack(spacing: 0) {
                            Spacer()

                            Text(book.title)
                                .font(.system(size: 10, weight: .semibold))
                                .lineLimit(1)
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 6)
                                .padding(.bottom, 7)
                                .padding(.top, 14)
                                .background(
                                    LinearGradient(
                                        colors: [Color.black.opacity(0), Color.black.opacity(0.92)],
                                        startPoint: .top,
                                        endPoint: .bottom
                                    )
                                )
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)

                        VStack(spacing: 0) {
                            Spacer()
                            ZStack(alignment: .leading) {
                                Rectangle()
                                    .fill(Color.black.opacity(0.35))
                                    .frame(width: cardSize, height: 3)
                                Rectangle()
                                    .fill(Branding.accent)
                                    .frame(width: progressFillWidth, height: 3)
                            }
                            .frame(width: cardSize, height: 3, alignment: .leading)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                        .zIndex(3)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                }
            }
            .buttonStyle(.plain)

            BookProgressPillView(
                progressPercent: progressPercent,
                font: .caption2.bold(),
                horizontalPadding: 5,
                verticalPadding: 2
            )
            .padding(6)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .zIndex(2)

            if isAdmin {
                Button("Edit") {
                    onAdminEdit()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.mini)
                .padding(5)
            }
        }
        .onAppear {
            logOverlayState("onAppear")
        }
        .onChange(of: progress.positionSeconds) { _, _ in
            logOverlayState("positionChanged")
        }
        .onChange(of: progress.durationAtSave) { _, _ in
            logOverlayState("durationChanged")
        }
        .onChange(of: progress.completed) { _, _ in
            logOverlayState("completedChanged")
        }
    }
}
