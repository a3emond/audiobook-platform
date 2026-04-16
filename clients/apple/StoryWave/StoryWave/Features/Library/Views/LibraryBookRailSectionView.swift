import SwiftUI
import AudiobookCore

struct LibraryBookRailSectionView: View {
    let title: String
    let headerDetail: AnyView?
    let books: [BookDTO]
    let actionLabel: String?
    let onAction: (() -> Void)?
    let coverURLForBook: (BookDTO) -> URL?
    let progressPercentForBookId: (String) -> Double?
    let isCompletedForBookId: (String) -> Bool
    let isAdmin: Bool
    let onEditBook: (String) -> Void
    let onOpenDetails: (BookDTO) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(title).font(.title2.weight(.semibold))
                    if let headerDetail {
                        headerDetail
                    }
                }
                Spacer()
                if let label = actionLabel, let onAction {
                    Button(label, action: onAction)
                        .font(.subheadline)
                        .foregroundStyle(Branding.accent)
                        .buttonStyle(.plain)
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 14) {
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
                .padding(.horizontal, 2)
                .padding(.bottom, 4)
            }
        }
    }
}
