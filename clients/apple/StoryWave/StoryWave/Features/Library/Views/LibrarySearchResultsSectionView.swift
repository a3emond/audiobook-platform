import SwiftUI
import AudiobookCore

struct LibrarySearchResultsSectionView: View {
    let query: String
    let isLoading: Bool
    let seriesRails: [(name: String, books: [BookDTO])]
    let totalResultCount: Int
    let coverURLForBook: (BookDTO) -> URL?
    let progressPercentForBookId: (String) -> Double?
    let isCompletedForBookId: (String) -> Bool
    let isAdmin: Bool
    let onEditBook: (String) -> Void
    let onOpenDetails: (BookDTO) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if seriesRails.isEmpty && !isLoading {
                Text("No results for \"\(query)\"")
                    .foregroundStyle(Branding.textMuted)
            } else {
                Text("\(totalResultCount) result\(totalResultCount == 1 ? "" : "s")")
                    .font(.subheadline)
                    .foregroundStyle(Branding.textMuted)

                ForEach(seriesRails, id: \.name) { rail in
                    LibraryBookRailSectionView(
                        title: rail.name,
                        headerDetail: nil,
                        books: rail.books,
                        actionLabel: nil,
                        onAction: nil,
                        coverURLForBook: coverURLForBook,
                        progressPercentForBookId: progressPercentForBookId,
                        isCompletedForBookId: isCompletedForBookId,
                        isAdmin: isAdmin,
                        onEditBook: onEditBook,
                        onOpenDetails: onOpenDetails
                    )
                }
            }
        }
    }
}
