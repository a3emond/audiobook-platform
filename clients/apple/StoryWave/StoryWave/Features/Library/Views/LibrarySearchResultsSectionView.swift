import SwiftUI
import AudiobookCore

struct LibrarySearchResultsSectionView: View {
    let query: String
    let isLoading: Bool
    let results: [BookDTO]
    let coverURLForBook: (BookDTO) -> URL?
    let progressPercentForBookId: (String) -> Double?
    let isCompletedForBookId: (String) -> Bool
    let isAdmin: Bool
    let onEditBook: (String) -> Void
    let onOpenDetails: (BookDTO) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if results.isEmpty && !isLoading {
                Text("No results for \"\(query)\"")
                    .foregroundStyle(Branding.textMuted)
            } else {
                Text("\(results.count) result\(results.count == 1 ? "" : "s")")
                    .font(.subheadline)
                    .foregroundStyle(Branding.textMuted)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 14)], spacing: 14) {
                    ForEach(results) { book in
                        BookCoverCard(
                            book: book,
                            coverURL: coverURLForBook(book),
                            progressPercent: progressPercentForBookId(book.id),
                            isCompleted: isCompletedForBookId(book.id),
                            isAdmin: isAdmin,
                            onAdminEdit: {
                                onEditBook(book.id)
                            }
                        ) {
                            onOpenDetails(book)
                        }
                    }
                }
            }
        }
    }
}
