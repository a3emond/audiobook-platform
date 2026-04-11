import Foundation

public protocol SecureStore {
    func save(key: String, value: String) throws
    func read(key: String) throws -> String?
    func delete(key: String) throws
}

public enum SecureStoreError: Error {
    case notImplemented
}
