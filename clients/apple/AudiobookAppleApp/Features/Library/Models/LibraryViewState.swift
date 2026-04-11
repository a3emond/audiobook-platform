import Foundation
import AudiobookCore

struct LibraryViewState {
    var isLoading: Bool = false
    var books: [LibraryBookDTO] = []
    var errorMessage: String?
}
