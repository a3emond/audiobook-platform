import SwiftUI

struct LibraryView: View {
    @ObservedObject var viewModel: LibraryViewModel
    let onOpenBook: (String, String) -> Void
    let onSignOut: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                BrandLogoView(size: 30)
                Text("Library")
                    .font(.title.weight(.semibold))
            }

            if viewModel.state.isLoading {
                ProgressView("Loading library...")
            }

            if let errorMessage = viewModel.state.errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
                Button("Retry") {
                    Task { await viewModel.loadLibrary() }
                }
            }

            if !viewModel.state.isLoading && viewModel.state.errorMessage == nil && viewModel.state.books.isEmpty {
                Text("No books available.")
                    .foregroundStyle(.secondary)
            }

            List(viewModel.state.books) { book in
                Button {
                    onOpenBook(book.id, book.title)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(book.title)
                            .font(.headline)
                        Text(book.author ?? "Unknown author")
                            .font(.subheadline)
                            .foregroundStyle(Branding.textMuted)
                    }
                }
                .buttonStyle(.plain)
                .listRowBackground(Branding.surface)
            }
            .scrollContentBackground(.hidden)
            .background(Branding.surface)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Button("Sign Out") {
                onSignOut()
            }
            .buttonStyle(.bordered)
        }
        .padding()
        .task {
            if viewModel.state.books.isEmpty {
                await viewModel.loadLibrary()
            }
        }
    }
}
