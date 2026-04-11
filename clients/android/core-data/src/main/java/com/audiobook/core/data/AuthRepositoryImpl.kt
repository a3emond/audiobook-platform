package com.audiobook.core.data

import com.audiobook.core.auth.AuthSessionManager
import com.audiobook.core.domain.AuthRepository
import com.audiobook.core.network.ApiClient
import org.json.JSONObject

class AuthRepositoryImpl(
    private val apiClient: ApiClient,
    private val sessionManager: AuthSessionManager
) : AuthRepository {
    override suspend fun login(email: String, password: String) {
        val request = JSONObject()
            .put("email", email)
            .put("password", password)
            .toString()

        val response = JSONObject(apiClient.postJson("api/v1/auth/login", request))
        val tokens = response.getJSONObject("tokens")
        val userId = response.optJSONObject("user")?.optString("id")

        sessionManager.updateSession(
            accessToken = tokens.getString("accessToken"),
            refreshToken = tokens.getString("refreshToken"),
            userId = userId?.ifBlank { null }
        )
    }

    override suspend fun refreshSession() {
        val refreshToken = sessionManager.refreshToken
            ?: throw IllegalStateException("Missing refresh token")

        val request = JSONObject()
            .put("refreshToken", refreshToken)
            .toString()

        val response = JSONObject(apiClient.postJson("api/v1/auth/refresh", request))

        sessionManager.updateSession(
            accessToken = response.getString("accessToken"),
            refreshToken = response.getString("refreshToken"),
            userId = sessionManager.userId
        )
    }

    override fun signOut() {
        sessionManager.clear()
    }

    override fun isAuthenticated(): Boolean {
        return sessionManager.isAuthenticated()
    }
}
