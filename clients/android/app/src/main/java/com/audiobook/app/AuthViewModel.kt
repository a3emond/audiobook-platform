package com.audiobook.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.audiobook.core.domain.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AuthUiState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val isAuthenticated: Boolean = false,
    val errorMessage: String? = null
)

class AuthViewModel(private val repository: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState(isAuthenticated = repository.isAuthenticated()))
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    fun onEmailChanged(value: String) {
        _state.value = _state.value.copy(email = value)
    }

    fun onPasswordChanged(value: String) {
        _state.value = _state.value.copy(password = value)
    }

    fun login() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, errorMessage = null)
            try {
                repository.login(_state.value.email, _state.value.password)
                _state.value = _state.value.copy(isLoading = false, isAuthenticated = true)
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    isAuthenticated = false,
                    errorMessage = "Login failed. Check credentials and try again."
                )
            }
        }
    }

    fun refreshSession() {
        viewModelScope.launch {
            try {
                repository.refreshSession()
                _state.value = _state.value.copy(isAuthenticated = true, errorMessage = null)
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isAuthenticated = false,
                    errorMessage = "Session expired. Please sign in again."
                )
            }
        }
    }

    fun signOut() {
        repository.signOut()
        _state.value = _state.value.copy(isAuthenticated = false, password = "")
    }
}
