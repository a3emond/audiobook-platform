import SwiftUI

struct PlayerCoverArtView: View {
    let coverURLString: String?
    let title: String
    let progressPercent: Double?
    let isCompleted: Bool
    let isAdmin: Bool
    let onMarkCompleted: () -> Void
    let onEditMetadata: () -> Void

    private var coverURL: URL? {
        guard let coverURLString else {
            return nil
        }
        return URL(string: coverURLString)
    }

    private var resolvedProgressPercent: Double? {
        if isCompleted { return 1 }
        return progressPercent ?? 0.01
    }

    var body: some View {
        BookCoverFrameView(
            url: coverURL,
            fallbackText: title.prefix(2).uppercased(),
            fallbackFontSize: 44,
            size: CGSize(width: 220, height: 220),
            cornerRadius: 20,
            shadowColor: .black.opacity(0.2),
            shadowRadius: 12,
            shadowY: 6
        )
        .overlay(alignment: .topLeading) {
            HStack(spacing: 8) {
                if !isCompleted {
                    Button("Complete", action: onMarkCompleted)
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                }

                if isAdmin {
                    Button("Edit Metadata", action: onEditMetadata)
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                }
            }
            .padding(10)
        }
        .overlay(alignment: .topLeading) {
            if let resolvedProgressPercent {
                BookProgressPillView(
                    progressPercent: resolvedProgressPercent,
                    font: .caption.bold(),
                    horizontalPadding: 8,
                    verticalPadding: 4
                )
                .padding(.top, 46)
                .padding(.leading, 10)
            }
        }
        .overlay(alignment: .bottom) {
            if let resolvedProgressPercent {
                BookProgressBarView(progressPercent: resolvedProgressPercent, height: 5)
            }
        }
        .overlay(alignment: .bottomLeading) {
            if isCompleted {
                BookCompletedBadgeView(
                    iconFont: .title2.weight(.bold),
                    titleFont: .caption.weight(.semibold),
                    spacing: 6,
                    horizontalPadding: 12,
                    verticalPadding: 10,
                    cornerRadius: 10
                )
                .padding(10)
            }
        }
    }
}