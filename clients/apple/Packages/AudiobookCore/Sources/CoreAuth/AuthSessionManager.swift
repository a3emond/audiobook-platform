import Foundation

public final class AuthSessionManager {
    private let accessTokenKey = "audiobook_access_token"
    private let refreshTokenKey = "audiobook_refresh_token"
    private let userIdKey = "audiobook_user_id"
    private let userDefaults: UserDefaults
    private let secureStore: SecureStore

    public private(set) var accessToken: String?
    public private(set) var refreshToken: String?
    public private(set) var userId: String?

    public init(
        userDefaults: UserDefaults = .standard,
        secureStore: SecureStore = KeychainSecureStore()
    ) {
        self.userDefaults = userDefaults
        self.secureStore = secureStore

        self.accessToken = try? secureStore.read(key: accessTokenKey)
        self.refreshToken = try? secureStore.read(key: refreshTokenKey)
        self.userId = userDefaults.string(forKey: userIdKey)
    }

    public func updateSession(accessToken: String, refreshToken: String, userId: String?) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.userId = userId

        do {
            try secureStore.save(key: accessTokenKey, value: accessToken)
            try secureStore.save(key: refreshTokenKey, value: refreshToken)
        } catch {
            // Do not throw from session update paths; best effort persistence keeps UX smooth.
        }

        if let userId {
            userDefaults.set(userId, forKey: userIdKey)
        } else {
            userDefaults.removeObject(forKey: userIdKey)
        }
    }

    public func clear() {
        accessToken = nil
        refreshToken = nil
        userId = nil

        do {
            try secureStore.delete(key: accessTokenKey)
            try secureStore.delete(key: refreshTokenKey)
        } catch {
            // Ignore cleanup failures; stale keychain values are overwritten on next login.
        }

        userDefaults.removeObject(forKey: userIdKey)
    }
}
