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
                libraryHeader

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
                    searchSection
                } else {
                    // Continue Listening strip
                    if !viewModel.state.continueListeningItems.isEmpty {
                        continueListeningSection
                    }

                    if !viewModel.state.latestBooks.isEmpty {
                        railSection(
                            title: "Latest Books",
                            books: viewModel.state.latestBooks,
                            actionLabel: nil,
                            actionHandler: nil
                        )
                    }

                    ForEach(viewModel.state.seriesRails, id: \.name) { rail in
                        railSection(
                            title: rail.name,
                            books: rail.books,
                            actionLabel: "See All",
                            actionHandler: { viewModel.showSeriesDetail(name: rail.name, books: rail.books) }
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
                        collectionsSection
                    }
                }

                Spacer(minLength: 32)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
        }
        .task {
            await viewModel.loadLibrary()
        }
        .sheet(isPresented: Binding(
            get: { viewModel.state.selectedSeriesName != nil },
            set: {
                if !$0 {
                    DispatchQueue.main.async {
                        viewModel.clearSeriesDetail()
                    }
                }
            }
        )) { detailGridSheet(
            title: viewModel.state.selectedSeriesName ?? "Series",
            books: viewModel.state.selectedSeriesBooks,
            onDismiss: { viewModel.clearSeriesDetail() }
        )}
        .sheet(isPresented: Binding(
            get: { viewModel.state.selectedCollectionName != nil },
            set: {
                if !$0 {
                    DispatchQueue.main.async {
                        viewModel.clearCollectionDetail()
                    }
                }
            }
        )) { detailGridSheet(
            title: viewModel.state.selectedCollectionName ?? "Collection",
            books: viewModel.state.selectedCollectionBooks,
            onDismiss: { viewModel.clearCollectionDetail() }
        )}
        .sheet(item: $selectedBookForDetails) { book in
            BookDetailsModalView(
                book: book,
                coverURL: viewModel.coverURL(for: book),
                progressPercent: viewModel.progressPercent(for: book.id),
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

    // MARK: - Header + search bar
    private var libraryHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                BrandLogoView(size: 28)
                Text("Library")
                    .font(.largeTitle.weight(.bold))
                Spacer()
                Button { Task { await onSignOut() } } label: {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .imageScale(.large)
                        .foregroundStyle(Branding.textMuted)
                }
                .buttonStyle(.plain)
                .help("Sign Out")
            }

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Branding.textMuted)
                TextField("Search books…", text: Binding(
                    get: { viewModel.state.query },
                    set: { viewModel.updateQuery($0) }
                ))
                .textFieldStyle(.plain)
                if !viewModel.state.query.isEmpty {
                    Button { viewModel.updateQuery("") } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(Branding.textMuted)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(10)
            .background(Branding.surface)
            .cornerRadius(10)
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

    private func railSection(
        title: String,
        books: [BookDTO],
        actionLabel: String?,
        actionHandler: (() -> Void)?
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title).font(.title2.weight(.semibold))
                Spacer()
                if let label = actionLabel, let handler = actionHandler {
                    Button(label, action: handler)
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
                            coverURL: viewModel.coverURL(for: book),
                            progressPercent: viewModel.progressPercent(for: book.id),
                            isAdmin: isAdmin,
                            onAdminEdit: {
                                onEditBook(book.id)
                            }
                        ) {
                            selectedBookForDetails = book
                        }
                    }
                }
                .padding(.horizontal, 2)
                .padding(.bottom, 4)
            }
        }
    }

    // MARK: - Collections grid
    private var collectionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Collections").font(.title2.weight(.semibold))
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 14)], spacing: 14) {
                ForEach(viewModel.state.collections) { collection in
                    Button {
                        Task { await viewModel.loadCollectionDetail(collection) }
                    } label: {
                        CollectionCard(
                            collection: collection,
                            previewURLs: collection.bookIds.prefix(4).compactMap { viewModel.coverURL(for: $0) }
                        )
                    }
                    .buttonStyle(.plain)
                }
            }

            if viewModel.state.collectionsHasMore {
                HStack {
                    Spacer()
                    Button {
                        Task { await viewModel.loadMoreCollections() }
                    } label: {
                        if viewModel.state.isLoadingMoreCollections {
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
                    .disabled(viewModel.state.isLoadingMoreCollections)
                    Spacer()
                }
            }
        }
    }

    // MARK: - Search results
    private var searchSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            let results = viewModel.state.displayedSearchResults
            if results.isEmpty && !viewModel.state.isLoading {
                Text("No results for \"\(viewModel.state.query)\"")
                    .foregroundStyle(Branding.textMuted)
            } else {
                Text("\(results.count) result\(results.count == 1 ? "" : "s")")
                    .font(.subheadline).foregroundStyle(Branding.textMuted)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 14)], spacing: 14) {
                    ForEach(results) { book in
                        BookCoverCard(
                            book: book,
                            coverURL: viewModel.coverURL(for: book),
                            progressPercent: viewModel.progressPercent(for: book.id),
                            isAdmin: isAdmin,
                            onAdminEdit: {
                                onEditBook(book.id)
                            }
                        ) {
                            selectedBookForDetails = book
                        }
                    }
                }
            }
        }
    }

    // MARK: - Detail grid sheet (series / collection)
    private func detailGridSheet(title: String, books: [BookDTO], onDismiss: @escaping () -> Void) -> some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 14)], spacing: 14) {
                    ForEach(books) { book in
                        BookCoverCard(
                            book: book,
                            coverURL: viewModel.coverURL(for: book),
                            progressPercent: viewModel.progressPercent(for: book.id),
                            isAdmin: isAdmin,
                            onAdminEdit: {
                                onEditBook(book.id)
                            }
                        ) {
                            selectedBookForDetails = book
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

// MARK: - BookCoverCard

// MARK: - BookDetailsModalView

private struct BookDetailsModalView: View {
    let book: BookDTO
    let coverURL: URL?
    let progressPercent: Double?
    let isAdmin: Bool
    let onPlay: () -> Void
    let onEditBook: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(alignment: .top, spacing: 16) {
                        ZStack(alignment: .bottomLeading) {
                            RemoteCoverImageView(
                                url: coverURL,
                                fallbackText: book.title.prefix(2).uppercased(),
                                fallbackFontSize: 28
                            )
                            .frame(width: 170, height: 170)
                            .clipShape(RoundedRectangle(cornerRadius: 12))

                            if let progressPercent {
                                GeometryReader { geometry in
                                    ZStack(alignment: .leading) {
                                        Rectangle().fill(Color.black.opacity(0.35))
                                        Rectangle()
                                            .fill(Branding.accent)
                                            .frame(width: geometry.size.width * progressPercent)
                                    }
                                }
                                .frame(height: 5)
                                .offset(y: 170 - 5)
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

// MARK: - BookCoverCard

private struct BookCoverCard: View {
    let book: BookDTO
    let coverURL: URL?
    let progressPercent: Double?
    let isAdmin: Bool
    let onAdminEdit: () -> Void
    let onTap: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Button(action: onTap) {
                VStack(alignment: .leading, spacing: 8) {
                    ZStack(alignment: .bottomLeading) {
                        RemoteCoverImageView(
                            url: coverURL,
                            fallbackText: book.title.prefix(2).uppercased(),
                            fallbackFontSize: 28
                        )
                        .frame(width: 140, height: 140)
                        .clipShape(RoundedRectangle(cornerRadius: 10))

                        if let progressPercent {
                            VStack(spacing: 0) {
                                HStack {
                                    Spacer()
                                    Text("\(Int(progressPercent * 100))%")
                                        .font(.caption2.bold())
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 3)
                                        .background(Color.black.opacity(0.76))
                                        .foregroundStyle(.white)
                                        .clipShape(Capsule())
                                        .padding(8)
                                }

                                Spacer()

                                GeometryReader { geometry in
                                    ZStack(alignment: .leading) {
                                        Rectangle()
                                            .fill(Color.black.opacity(0.35))
                                        Rectangle()
                                            .fill(Branding.accent)
                                            .frame(width: geometry.size.width * progressPercent)
                                    }
                                }
                                .frame(height: 4)
                            }
                        }
                    }
                    .frame(width: 140, height: 140)
                    .shadow(color: .black.opacity(0.25), radius: 4, x: 0, y: 2)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(book.title)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(2)
                            .foregroundStyle(Branding.text)
                        if let author = book.author {
                            Text(author)
                                .font(.caption)
                                .foregroundStyle(Branding.textMuted)
                                .lineLimit(1)
                        }
                    }
                    .frame(width: 140, alignment: .leading)
                }
            }
            .buttonStyle(.plain)

            if isAdmin {
                Button("Edit") {
                    onAdminEdit()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.mini)
                .padding(6)
            }
        }
    }
}

// MARK: - CollectionCard

private struct CollectionCard: View {
    let collection: CollectionDTO
    let previewURLs: [URL]
    // prefix(4) is done by caller; LazyVGrid is safe for 0–4 URLs
    private let gridColumns = [GridItem(.flexible(), spacing: 2), GridItem(.flexible(), spacing: 2)]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Group {
                if previewURLs.isEmpty {
                    RoundedRectangle(cornerRadius: 8).fill(Branding.surface)
                } else {
                    LazyVGrid(columns: gridColumns, spacing: 2) {
                        ForEach(previewURLs.prefix(4), id: \.absoluteString) { url in
                            AsyncImage(url: url) { phase in
                                if case .success(let img) = phase {
                                    img.resizable().aspectRatio(1, contentMode: .fill)
                                } else {
                                    Branding.surface
                                }
                            }
                            .aspectRatio(1, contentMode: .fill)
                            .clipped()
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .frame(height: 90)

            VStack(alignment: .leading, spacing: 2) {
                Text(collection.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                    .foregroundStyle(Branding.text)
                Text("\(collection.bookIds.count) book\(collection.bookIds.count == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(Branding.textMuted)
            }
        }
        .padding(12)
        .background(Branding.surface)
        .cornerRadius(12)

    }
}

