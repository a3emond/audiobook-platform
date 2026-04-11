package com.audiobook.core.domain

interface AuthRepository {
    suspend fun login(email: String, password: String)
    suspend fun refreshSession()
    fun signOut()
    fun isAuthenticated(): Boolean
}
