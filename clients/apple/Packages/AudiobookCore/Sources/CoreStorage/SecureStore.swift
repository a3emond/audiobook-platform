import Foundation
import Security

public protocol SecureStore {
    func save(key: String, value: String) throws
    func read(key: String) throws -> String?
    func delete(key: String) throws
}

public enum SecureStoreError: Error {
    case encodingFailed
    case decodingFailed
    case unexpectedStatus(OSStatus)
}

public final class KeychainSecureStore: SecureStore {
    private let service: String

    public init(service: String = "storywave.auth") {
        self.service = service
    }

    public func save(key: String, value: String) throws {
        guard let data = value.data(using: .utf8) else {
            throw SecureStoreError.encodingFailed
        }

        let baseQuery = keychainQuery(key: key)
        SecItemDelete(baseQuery as CFDictionary)

        var attributes = baseQuery
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw SecureStoreError.unexpectedStatus(status)
        }
    }

    public func read(key: String) throws -> String? {
        var query = keychainQuery(key: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            return nil
        }

        guard status == errSecSuccess else {
            throw SecureStoreError.unexpectedStatus(status)
        }

        guard let data = item as? Data, let value = String(data: data, encoding: .utf8) else {
            throw SecureStoreError.decodingFailed
        }

        return value
    }

    public func delete(key: String) throws {
        let status = SecItemDelete(keychainQuery(key: key) as CFDictionary)
        if status == errSecItemNotFound || status == errSecSuccess {
            return
        }

        throw SecureStoreError.unexpectedStatus(status)
    }

    private func keychainQuery(key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
    }
}
