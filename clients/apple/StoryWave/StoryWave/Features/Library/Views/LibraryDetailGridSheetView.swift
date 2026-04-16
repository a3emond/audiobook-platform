import SwiftUI
import AudiobookCore

struct LibraryDetailGridSheetView: View {
    let title: String
    let books: [BookDTO]
    let coverURLForBook: (BookDTO) -> URL?
    let progressPercentForBookId: (String) -> Double?
    let isCompletedForBookId: (String) -> Bool
    let isAdmin: Bool
    let onEditBook: (String) -> Void
    let onOpenDetails: (BookDTO) -> Void
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 14)], spacing: 14) {
                    ForEach(books) { book in
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
                .padding(20)
            }
            .navigationTitle(title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", action: onDismiss)
                }
            }
        }
#if os(iOS)
        .presentationDetents([.medium, .large])
#endif
    }
}
