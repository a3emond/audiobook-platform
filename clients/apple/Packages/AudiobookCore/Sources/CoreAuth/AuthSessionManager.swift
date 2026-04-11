import Foundation

public final class AuthSessionManager {
    private let accessTokenKey = "audiobook_access_token"
    private let refreshTokenKey = "audiobook_refresh_token"
    private let userIdKey = "audiobook_user_id"
    private let userDefaults: UserDefaults

    public private(set) var accessToken: String?
    public private(set) var refreshToken: String?
    public private(set) var userId: String?

    public init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
        self.accessToken = userDefaults.string(forKey: accessTokenKey)
        self.refreshToken = userDefaults.string(forKey: refreshTokenKey)
        self.userId = userDefaults.string(forKey: userIdKey)
    }

    public func updateSession(accessToken: String, refreshToken: String, userId: String?) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.userId = userId
        userDefaults.set(accessToken, forKey: accessTokenKey)
        userDefaults.set(refreshToken, forKey: refreshTokenKey)
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
        userDefaults.removeObject(forKey: accessTokenKey)
        userDefaults.removeObject(forKey: refreshTokenKey)
        userDefaults.removeObject(forKey: userIdKey)
    }
}
