import Foundation

public struct LibraryBookDTO: Decodable, Identifiable {
    public let id: String
    public let title: String
    public let author: String?
    public let coverPath: String?

    public init(id: String, title: String, author: String?, coverPath: String?) {
        self.id = id
        self.title = title
        self.author = author
        self.coverPath = coverPath
    }
}

public struct LibraryListResponseDTO: Decodable {
    public let books: [LibraryBookDTO]
    public let total: Int
}
