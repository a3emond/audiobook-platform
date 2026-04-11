package com.audiobook.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.audiobook.core.domain.LibraryRepository

class LibraryViewModelFactory(private val repository: LibraryRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return LibraryViewModel(repository) as T
    }
}
