import SwiftUI
import AudiobookCore

struct BookDetailsModalView: View {
    let book: BookDTO
    let coverURL: URL?
    let progressPercent: Double?
    let isCompleted: Bool
    let isAdmin: Bool
    let onPlay: () -> Void
    let onEditBook: () -> Void

    @Environment(\.dismiss) private var dismiss

    private var resolvedProgressPercent: Double? {
        if isCompleted {
            return 1
        }
        return progressPercent
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(alignment: .top, spacing: 16) {
                        BookCoverFrameView(
                            url: coverURL,
                            fallbackText: book.title.prefix(2).uppercased(),
                            fallbackFontSize: 28,
                            size: CGSize(width: 170, height: 170),
                            cornerRadius: 12
                        ) {
                            if let resolvedProgressPercent {
                                VStack(spacing: 0) {
                                    HStack {
                                        BookProgressPillView(progressPercent: resolvedProgressPercent)
                                            .padding(8)
                                        Spacer()
                                    }

                                    Spacer()
                                    BookProgressBarView(progressPercent: resolvedProgressPercent, height: 5)
                                }
                            }

                            if isCompleted {
                                BookCompletedBadgeView(
                                    iconFont: .title3.weight(.bold),
                                    titleFont: .caption.weight(.semibold),
                                    spacing: 6,
                                    horizontalPadding: 10,
                                    verticalPadding: 8,
                                    cornerRadius: 10
                                )
                                .padding(8)
                                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                            }
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text(book.title)
                                .font(.title3.weight(.bold))
                            Text(book.author ?? "Unknown author")
                                .font(.subheadline)
                                .foregroundStyle(Branding.textMuted)

                            VStack(alignment: .leading, spacing: 4) {
                                Text("Duration: \(formattedDuration(book.duration))")
                                    .font(.subheadline)
                                if let series = book.series {
                                    Text("Series: \(series)\(book.seriesIndex.map { " #\($0)" } ?? "")")
                                        .font(.subheadline)
                                }
                                if let genre = book.genre {
                                    Text("Genre: \(genre)")
                                        .font(.subheadline)
                                }
                            }
                            .foregroundStyle(Branding.textMuted)
                        }
                    }

                    if let tags = book.tags, !tags.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Tags")
                                .font(.headline)
                            Text(tags.joined(separator: ", "))
                                .font(.subheadline)
                                .foregroundStyle(Branding.textMuted)
                        }
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Description")
                            .font(.headline)
                        Text(descriptionText(for: book))
                            .font(.body)
                            .foregroundStyle(Branding.textMuted)
                    }

                    HStack(spacing: 10) {
                        Button("Play") {
                            dismiss()
                            onPlay()
                        }
                        .buttonStyle(.borderedProminent)

                        if isAdmin {
                            Button("Edit Metadata") {
                                dismiss()
                                onEditBook()
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
                .padding(20)
            }
            .navigationTitle("Book Details")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
#if os(iOS)
        .presentationDetents([.medium, .large])
#endif
    }

    private func formattedDuration(_ rawDuration: Int?) -> String {
        guard let rawDuration else {
            return "Unknown"
        }

        let seconds: Int
        if rawDuration > 200_000 {
            seconds = max(1, rawDuration / 1000)
        } else {
            seconds = max(1, rawDuration)
        }

        let hours = seconds / 3600
        let minutes = Int(round(Double(seconds % 3600) / 60.0))

        if hours > 0 {
            return "\(hours)h \(minutes)m"
        }
        return "\(minutes)m"
    }

    private func descriptionText(for book: BookDTO) -> String {
        if let description = book.description {
            return description.defaultText?.trimmingCharacters(in: .whitespacesAndNewlines)
                ?? description.en?.trimmingCharacters(in: .whitespacesAndNewlines)
                ?? description.fr?.trimmingCharacters(in: .whitespacesAndNewlines)
                ?? "No description is available for this book yet."
        }
        return "No description is available for this book yet."
    }
}
