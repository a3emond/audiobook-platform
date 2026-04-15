import SwiftUI
import AudiobookCore

struct SeriesDetailPageView: View {
    let seriesName: String
    let books: [BookDTO]
    let coverURLForBook: (BookDTO) -> URL?
    let progressPercentForBookId: (String) -> Double?
    let isAdmin: Bool
    let onOpenBook: (String, String) -> Void
    let onEditBook: (String) -> Void
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(seriesName)
                                .font(.title2.weight(.bold))
                            Text("\(books.count) book\(books.count == 1 ? "" : "s")")
                                .font(.subheadline)
                                .foregroundStyle(Branding.textMuted)
                        }
                        Spacer()
                    }

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 14)], spacing: 14) {
                        ForEach(books) { book in
                            BookCoverCard(
                                book: book,
                                coverURL: coverURLForBook(book),
                                progressPercent: progressPercentForBookId(book.id),
                                isAdmin: isAdmin,
                                onAdminEdit: {
                                    onClose()
                                    onEditBook(book.id)
                                }
                            ) {
                                onClose()
                                onOpenBook(book.id, book.title)
                            }
                        }
                    }
                }
                .padding(20)
            }
            .navigationTitle("Series")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", action: onClose)
                }
            }
        }
#if os(iOS)
        .presentationDetents([.large])
#endif
    }
}
