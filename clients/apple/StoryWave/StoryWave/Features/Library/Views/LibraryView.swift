import SwiftUI
import AudiobookCore

// MARK: - LibraryView

struct LibraryView: View {
    @ObservedObject var viewModel: LibraryViewModel
    let isAdmin: Bool
    let onOpenBook: (String, String) -> Void
    let onEditBook: (String) -> Void
    let onSignOut: () async -> Void

    @State private var selectedBookForDetails: BookDTO?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 28) {
                LibraryHeaderView(
                    query: Binding(
                        get: { viewModel.state.query },
                        set: { viewModel.updateQuery($0) }
                    ),
                    onQueryChange: { viewModel.updateQuery($0) },
                    onSignOut: onSignOut
                )

                if viewModel.state.isLoading && viewModel.state.allBooks.isEmpty {
                    ProgressView("Loading library…")
                        .frame(maxWidth: .infinity, minHeight: 120)
                }

                if let err = viewModel.state.errorMessage {
                    HStack(spacing: 10) {
                        Image(systemName: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                        Text(err)
                            .font(.subheadline)
                            .foregroundStyle(Branding.textMuted)
                        Spacer()
                        Button("Retry") { Task { await viewModel.loadLibrary() } }
                            .buttonStyle(.bordered)
                    }
                    .padding(12)
                    .background(Color.orange.opacity(0.12))
                    .cornerRadius(10)
                }

                if !viewModel.state.query.isEmpty {
                    LibrarySearchResultsSectionView(
                        query: viewModel.state.query,
                        isLoading: viewModel.state.isLoading,
                        seriesRails: viewModel.state.displayedSearchSeriesRails,
                        totalResultCount: viewModel.state.displayedSearchResultCount,
                        coverURLForBook: { viewModel.coverURL(for: $0) },
                        progressPercentForBookId: { viewModel.progressPercent(for: $0) },
                        isCompletedForBookId: { viewModel.isCompleted(for: $0) },
                        isAdmin: isAdmin,
                        onEditBook: onEditBook,
                        onOpenDetails: { selectedBookForDetails = $0 }
                    )
                } else {
                    // Continue Listening strip
                    if !viewModel.state.continueListeningItems.isEmpty {
                        continueListeningSection
                    }

                    if !viewModel.state.latestBooks.isEmpty {
                        LibraryBookRailSectionView(
                            title: "Latest Books",
                            headerDetail: nil,
                            books: viewModel.state.latestBooks,
                            actionLabel: nil,
                            onAction: nil,
                            coverURLForBook: { viewModel.coverURL(for: $0) },
                            progressPercentForBookId: { viewModel.progressPercent(for: $0) },
                            isCompletedForBookId: { viewModel.isCompleted(for: $0) },
                            isAdmin: isAdmin,
                            onEditBook: onEditBook,
                            onOpenDetails: { selectedBookForDetails = $0 }
                        )
                    }

                    ForEach(viewModel.state.seriesRails, id: \.name) { rail in
                        LibraryBookRailSectionView(
                            title: rail.name,
                            headerDetail: AnyView(
                                SeriesProgressSummaryView(
                                    snapshot: viewModel.seriesProgress(for: rail.books),
                                    compact: true
                                )
                            ),
                            books: rail.books,
                            actionLabel: "See All",
                            onAction: { Task { await viewModel.showSeriesDetail(name: rail.name) } },
                            coverURLForBook: { viewModel.coverURL(for: $0) },
                            progressPercentForBookId: { viewModel.progressPercent(for: $0) },
                            isCompletedForBookId: { viewModel.isCompleted(for: $0) },
                            isAdmin: isAdmin,
                            onEditBook: onEditBook,
                            onOpenDetails: { selectedBookForDetails = $0 }
                        )
                    }

                    if viewModel.state.booksHasMore {
                        HStack {
                            Spacer()
                            Button {
                                Task { await viewModel.loadMoreBooks() }
                            } label: {
                                if viewModel.state.isLoadingMoreBooks {
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
                            .disabled(viewModel.state.isLoadingMoreBooks)
                            Spacer()
                        }
                    }

                    if !viewModel.state.collections.isEmpty {
                        LibraryCollectionsSectionView(
                            collections: viewModel.state.collections,
                            hasMore: viewModel.state.collectionsHasMore,
                            isLoadingMore: viewModel.state.isLoadingMoreCollections,
                            coverURLForBookId: { viewModel.coverURL(for: $0) },
                            onOpenCollection: { collection in
                                Task { await viewModel.loadCollectionDetail(collection) }
                            },
                            onLoadMore: {
                                Task { await viewModel.loadMoreCollections() }
                            }
                        )
                    }
                }

                Spacer(minLength: 32)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .task {
            await viewModel.loadLibrary()
        }
        .sheet(isPresented: Binding(
            get: { viewModel.state.selectedCollectionName != nil },
            set: {
                if !$0 {
                    DispatchQueue.main.async {
                        viewModel.clearCollectionDetail()
                    }
                }
            }
        )) { LibraryDetailGridSheetView(
            title: viewModel.state.selectedCollectionName ?? "Collection",
            books: viewModel.state.selectedCollectionBooks,
            coverURLForBook: { viewModel.coverURL(for: $0) },
            progressPercentForBookId: { viewModel.progressPercent(for: $0) },
            isCompletedForBookId: { viewModel.isCompleted(for: $0) },
            isAdmin: isAdmin,
            onEditBook: onEditBook,
            onOpenDetails: { selectedBookForDetails = $0 },
            onDismiss: { viewModel.clearCollectionDetail() }
        )}
        .sheet(item: $selectedBookForDetails) { book in
            BookDetailsModalView(
                book: book,
                coverURL: viewModel.coverURL(for: book),
                progressPercent: viewModel.progressPercent(for: book.id),
                isCompleted: viewModel.isCompleted(for: book.id),
                isAdmin: isAdmin,
                onPlay: {
                    selectedBookForDetails = nil
                    viewModel.clearSeriesDetail()
                    viewModel.clearCollectionDetail()
                    onOpenBook(book.id, book.title)
                },
                onEditBook: {
                    selectedBookForDetails = nil
                    onEditBook(book.id)
                }
            )
        }
    }

    // MARK: - Continue Listening strip
    private var continueListeningSection: some View {
        ContinueListeningStripView(
            items: viewModel.state.continueListeningItems,
            coverURLForBook: { viewModel.coverURL(for: $0) },
            isAdmin: isAdmin,
            onOpenBook: onOpenBook,
            onEditBook: onEditBook
        )
    }
}

