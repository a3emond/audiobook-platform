import Foundation
import AudiobookCore

@MainActor
final class LibraryViewModel: ObservableObject {
    @Published private(set) var state = LibraryViewState()

    private let repository: LibraryRepository
    private let localization = LocalizationService.shared

    init(repository: LibraryRepository) {
        self.repository = repository
    }

    func loadLibrary() async {
        state.isLoading = true
        state.errorMessage = nil

        do {
            state.books = try await repository.listBooks(language: localization.locale)
        } catch {
            state.books = []
            state.errorMessage = "Could not load your library."
        }

        state.isLoading = false
    }

    func reset() {
        state = LibraryViewState()
    }
}
