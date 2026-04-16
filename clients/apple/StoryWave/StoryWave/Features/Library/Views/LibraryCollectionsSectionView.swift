import SwiftUI
import AudiobookCore

struct LibraryCollectionsSectionView: View {
    let collections: [CollectionDTO]
    let hasMore: Bool
    let isLoadingMore: Bool
    let coverURLForBookId: (String) -> URL?
    let onOpenCollection: (CollectionDTO) -> Void
    let onLoadMore: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Collections").font(.title2.weight(.semibold))
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 14)], spacing: 14) {
                ForEach(collections) { collection in
                    Button {
                        onOpenCollection(collection)
                    } label: {
                        CollectionCard(
                            collection: collection,
                            previewURLs: collection.bookIds.prefix(4).compactMap { coverURLForBookId($0) }
                        )
                    }
                    .buttonStyle(.plain)
                }
            }

            if hasMore {
                HStack {
                    Spacer()
                    Button {
                        onLoadMore()
                    } label: {
                        if isLoadingMore {
                            HStack(spacing: 8) {
                                ProgressView()
                                    .controlSize(.small)
                                Text("Loading more")
                            }
                        } else {
                            Text("Load more")
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(isLoadingMore)
                    Spacer()
                }
            }
        }
    }
}
