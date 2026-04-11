package com.audiobook.core.data

import com.audiobook.core.auth.AuthSessionManager
import com.audiobook.core.domain.AuthRepository
import com.audiobook.core.network.ApiClient
import com.audiobook.core.network.ApiException

class AuthorizedRequestExecutor(
    private val apiClient: ApiClient,
    private val authRepository: AuthRepository,
    private val sessionManager: AuthSessionManager
) {
    suspend fun get(path: String): String {
        return executeWithRetry { token ->
            apiClient.getJson(path, headers = bearerHeader(token))
        }
    }

    suspend fun post(path: String, body: String): String {
        return executeWithRetry { token ->
            apiClient.postJson(path, body, headers = bearerHeader(token))
        }
    }

    suspend fun put(path: String, body: String): String {
        return executeWithRetry { token ->
            apiClient.putJson(path, body, headers = bearerHeader(token))
        }
    }

    suspend fun patch(path: String, body: String): String {
        return executeWithRetry { token ->
            apiClient.patchJson(path, body, headers = bearerHeader(token))
        }
    }

    suspend fun delete(path: String): String {
        return executeWithRetry { token ->
            apiClient.delete(path, headers = bearerHeader(token))
        }
    }

    private suspend fun executeWithRetry(request: suspend (String) -> String): String {
        val token = sessionManager.accessToken
            ?: throw IllegalStateException("Missing access token")

        return try {
            request(token)
        } catch (e: ApiException) {
            if (e.statusCode != 401 && e.statusCode != 403) {
                throw e
            }

            authRepository.refreshSession()
            val refreshedToken = sessionManager.accessToken
                ?: throw IllegalStateException("Missing access token after refresh")
            request(refreshedToken)
        }
    }

    private fun bearerHeader(token: String): Map<String, String> {
        return mapOf("Authorization" to "Bearer $token")
    }
}
