package com.audiobook.core.data

import com.audiobook.core.auth.AuthSessionManager
import com.audiobook.core.domain.AuthRepository
import com.audiobook.core.domain.BookItem
import com.audiobook.core.domain.LibraryRepository
import com.audiobook.core.network.ApiClient
import org.json.JSONObject

class LibraryRepositoryImpl(
    private val apiClient: ApiClient,
    private val authRepository: AuthRepository,
    private val sessionManager: AuthSessionManager
) : LibraryRepository {
    private val authorized = AuthorizedRequestExecutor(
        apiClient = apiClient,
        authRepository = authRepository,
        sessionManager = sessionManager
    )

    override suspend fun listBooks(language: String): List<BookItem> {
        val response = JSONObject(authorized.get("api/v1/books?language=$language"))
        val booksArray = response.optJSONArray("books") ?: return emptyList()

        return List(booksArray.length()) { index ->
            val item = booksArray.getJSONObject(index)
            BookItem(
                id = item.optString("id"),
                title = item.optString("title"),
                author = item.optString("author").ifBlank { null },
                coverPath = item.optString("coverPath").ifBlank { null }
            )
        }
    }
}
