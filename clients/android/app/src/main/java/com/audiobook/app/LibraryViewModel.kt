package com.audiobook.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.audiobook.core.domain.BookItem
import com.audiobook.core.domain.LibraryRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class LibraryUiState(
    val isLoading: Boolean = false,
    val books: List<BookItem> = emptyList(),
    val errorMessage: String? = null
)

class LibraryViewModel(private val repository: LibraryRepository) : ViewModel() {
    private val _state = MutableStateFlow(LibraryUiState())
    val state: StateFlow<LibraryUiState> = _state.asStateFlow()

    fun loadLibrary(localization: LocalizationService) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, errorMessage = null)
            try {
                val books = repository.listBooks(localization.currentLocale)
                _state.value = LibraryUiState(isLoading = false, books = books)
            } catch (e: Exception) {
                _state.value = LibraryUiState(
                    isLoading = false,
                    books = emptyList(),
                    errorMessage = "Could not load your library."
                )
            }
        }
    }
}
