import Foundation

public struct LibraryBookDTO: Decodable, Identifiable {
    public let id: String
    public let title: String
    public let author: String?
    public let coverPath: String?
}

public struct LibraryListResponseDTO: Decodable {
    public let books: [LibraryBookDTO]
    public let total: Int
}
