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

    private var progressPercent: Double {
        guard progress.durationAtSave > 0 else { return 0 }
        return min(1, max(0, Double(progress.positionSeconds) / Double(progress.durationAtSave)))
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Button(action: onTap) {
                ZStack(alignment: .bottomLeading) {
                    RemoteCoverImageView(
                        url: coverURL,
                        fallbackText: book.title.prefix(2).uppercased(),
                        fallbackFontSize: 18
                    )
                    .frame(width: cardSize, height: cardSize)
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                    VStack(spacing: 0) {
                        HStack {
                            Text("\(Int(progressPercent * 100))%")
                                .font(.caption2.bold())
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.black.opacity(0.78))
                                .foregroundStyle(.white)
                                .clipShape(Capsule())
                            Spacer()
                        }
                        .padding(6)

                        Spacer()

                        VStack(spacing: 0) {
                            Text(book.title)
                                .font(.system(size: 10, weight: .semibold))
                                .lineLimit(1)
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 6)
                                .padding(.bottom, 5)
                                .padding(.top, 14)
                                .background(
                                    LinearGradient(
                                        colors: [Color.black.opacity(0), Color.black.opacity(0.92)],
                                        startPoint: .top,
                                        endPoint: .bottom
                                    )
                                )

                            GeometryReader { geometry in
                                ZStack(alignment: .leading) {
                                    Rectangle()
                                        .fill(Color.black.opacity(0.35))
                                    Rectangle()
                                        .fill(Branding.accent)
                                        .frame(width: geometry.size.width * progressPercent)
                                }
                            }
                            .frame(height: 3)
                        }
                    }
                }
                .frame(width: cardSize, height: cardSize)
                .shadow(color: .black.opacity(0.25), radius: 4, x: 0, y: 2)
            }
            .buttonStyle(.plain)

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
