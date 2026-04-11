package com.audiobook.core.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class AuthSessionManager private constructor(
    private val tokenStore: TokenStore
) {
    var accessToken: String? = tokenStore.accessToken
        private set
    var refreshToken: String? = tokenStore.refreshToken
        private set
    var userId: String? = tokenStore.userId
        private set

    constructor() : this(InMemoryTokenStore())

    companion object {
        fun create(context: Context): AuthSessionManager {
            return AuthSessionManager(SecureTokenStore(context.applicationContext))
        }
    }

    fun updateSession(accessToken: String, refreshToken: String, userId: String?) {
        this.accessToken = accessToken
        this.refreshToken = refreshToken
        this.userId = userId
        tokenStore.save(accessToken, refreshToken, userId)
    }

    fun clear() {
        accessToken = null
        refreshToken = null
        userId = null
        tokenStore.clear()
    }

    fun isAuthenticated(): Boolean {
        return !accessToken.isNullOrBlank() && !refreshToken.isNullOrBlank()
    }
}

private interface TokenStore {
    val accessToken: String?
    val refreshToken: String?
    val userId: String?
    fun save(accessToken: String, refreshToken: String, userId: String?)
    fun clear()
}

private class InMemoryTokenStore : TokenStore {
    private var localAccessToken: String? = null
    private var localRefreshToken: String? = null
    private var localUserId: String? = null

    override val accessToken: String?
        get() = localAccessToken

    override val refreshToken: String?
        get() = localRefreshToken

    override val userId: String?
        get() = localUserId

    override fun save(accessToken: String, refreshToken: String, userId: String?) {
        localAccessToken = accessToken
        localRefreshToken = refreshToken
        localUserId = userId
    }

    override fun clear() {
        localAccessToken = null
        localRefreshToken = null
        localUserId = null
    }
}

private class SecureTokenStore(context: Context) : TokenStore {
    private val prefs: SharedPreferences

    init {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        prefs = EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    override val accessToken: String?
        get() = prefs.getString(KEY_ACCESS_TOKEN, null)

    override val refreshToken: String?
        get() = prefs.getString(KEY_REFRESH_TOKEN, null)

    override val userId: String?
        get() = prefs.getString(KEY_USER_ID, null)

    override fun save(accessToken: String, refreshToken: String, userId: String?) {
        val editor = prefs.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)

        if (userId != null) {
            editor.putString(KEY_USER_ID, userId)
        } else {
            editor.remove(KEY_USER_ID)
        }

        editor.apply()
    }

    override fun clear() {
        prefs.edit()
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_USER_ID)
            .apply()
    }

    private companion object {
        const val PREFS_NAME = "auth_secure_store"
        const val KEY_ACCESS_TOKEN = "access_token"
        const val KEY_REFRESH_TOKEN = "refresh_token"
        const val KEY_USER_ID = "user_id"
    }
}
