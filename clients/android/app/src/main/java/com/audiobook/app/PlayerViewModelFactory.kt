package com.audiobook.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.audiobook.core.domain.PlayerRepository

class PlayerViewModelFactory(private val repository: PlayerRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return PlayerViewModel(repository) as T
    }
}
