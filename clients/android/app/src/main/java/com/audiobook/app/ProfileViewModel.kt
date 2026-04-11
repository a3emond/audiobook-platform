package com.audiobook.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

data class ProfileUiState(
    val isLoading: Boolean = false,
    val userId: String? = null,
    val email: String? = null,
    val displayName: String? = null,
    val role: String? = null,
    val selectedLocale: String = "en",
    val error: String? = null
)

class ProfileViewModel : ViewModel() {
    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state

    fun loadProfile(userId: String, email: String, localization: LocalizationService) {
        _state.value = _state.value.copy(
            isLoading = false,
            userId = userId,
            email = email,
            selectedLocale = localization.currentLocale
        )
    }

    fun changeLanguage(locale: String, localization: LocalizationService) {
        localization.currentLocale = locale
        _state.value = _state.value.copy(selectedLocale = locale)
    }

    fun signOut(onSignOut: () -> Unit) {
        onSignOut()
    }
}

@Composable
fun ProfileScreen(state: ProfileUiState, viewModel: ProfileViewModel, onSignOut: () -> Unit, localization: LocalizationService) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        if (state.isLoading) {
            CircularProgressIndicator()
        } else if (state.error != null) {
            Text("Error: ${state.error}", color = Color.Red)
        } else {
            // Profile header
            Icon(
                imageVector = Icons.Default.Person,
                contentDescription = "Profile",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(80.dp),
                tint = Color(0xFFFF8C00)
            )

            Text(
                state.displayName ?: "User",
                style = MaterialTheme.typography.headlineSmall,
                color = Color(0xFFF4ECD9)
            )

            Text(
                state.email ?: "user@example.com",
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFFB8AE97)
            )

            // Language selection
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    "Language",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFFF4ECD9)
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = { viewModel.changeLanguage("en", localization) },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (state.selectedLocale == "en") Color(0xFFFF8C00) else Color(0xFF191919),
                            contentColor = Color(0xFFF4ECD9)
                        ),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("English")
                    }

                    Button(
                        onClick = { viewModel.changeLanguage("fr", localization) },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (state.selectedLocale == "fr") Color(0xFFFF8C00) else Color(0xFF191919),
                            contentColor = Color(0xFFF4ECD9)
                        ),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Français")
                    }
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            // Sign out button
            Button(
                onClick = { viewModel.signOut(onSignOut) },
                colors = ButtonDefaults.buttonColors(containerColor = Color.Red.copy(alpha = 0.2f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Sign Out", color = Color.Red)
            }
        }
    }
}
