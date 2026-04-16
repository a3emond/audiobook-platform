import SwiftUI
import AudiobookCore

/*
 Purpose:
 Compact Continue Listening rail shown on the Library page.

 Notes:
 - Uses compact 86x86 cover cards to keep this row secondary to main rails.
 - Card overlays are implemented in ContinueListeningCardComponents.swift.
*/
struct ContinueListeningStripView: View {
    // MARK: Types

    typealias ContinueItem = (book: BookDTO, progress: ProgressRecordDTO)

    // MARK: Inputs

    let items: [ContinueItem]
    let coverURLForBook: (String) -> URL?
    let isAdmin: Bool
    let onOpenBook: (String, String) -> Void
    let onEditBook: (String) -> Void

    // MARK: View

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
    // MARK: Inputs

    let book: BookDTO
    let progress: ProgressRecordDTO
    let coverURL: URL?
    let isAdmin: Bool
    let onAdminEdit: () -> Void
    let onTap: () -> Void

    // MARK: Styling

    private let cardSize: CGFloat = 86

    // MARK: Derived State

    private var progressPercent: Double {
        LibraryProgressMath.progressPercent(
            progress: progress,
            bookDurationSeconds: book.duration,
            zeroDurationBehavior: .startedFallback
        ) ?? 0
    }

    // MARK: View

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
                    ContinueListeningCardOverlayView(
                        title: book.title,
                        cardSize: cardSize,
                        progressPercent: progressPercent
                    )
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
    }
}
