package com.audiobook.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.audiobook.core.domain.AuthRepository

class AuthViewModelFactory(private val repository: AuthRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return AuthViewModel(repository) as T
    }
}
