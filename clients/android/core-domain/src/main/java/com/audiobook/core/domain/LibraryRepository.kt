package com.audiobook.core.domain

interface LibraryRepository {
    suspend fun listBooks(language: String = "en"): List<BookItem>
}

data class BookItem(
    val id: String,
    val title: String,
    val author: String?,
    val coverPath: String?
)
