package com.audiobook.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

data class DiscussionUiState(
    val isLoading: Boolean = false,
    val channels: List<DiscussionChannel> = emptyList(),
    val messages: List<DiscussionMessage> = emptyList(),
    val selectedChannelId: String? = null,
    val messageInput: String = "",
    val error: String? = null
)

data class DiscussionChannel(val id: String, val displayName: String, val language: String)
data class DiscussionMessage(val id: String, val text: String, val senderName: String?, val timestamp: String)

class DiscussionViewModel : ViewModel() {
    private val _state = MutableStateFlow(DiscussionUiState())
    val state: StateFlow<DiscussionUiState> = _state

    fun loadChannels(apiClient: com.audiobook.core.network.ApiClient, authToken: String, localization: LocalizationService) {
        viewModelScope.launch {
            try {
                _state.value = _state.value.copy(isLoading = true)
                val response = apiClient.getJson("api/v1/discussions/channels?language=${localization.currentLocale}")
                val channelsArray = JSONArray(response)
                val channels = mutableListOf<DiscussionChannel>()
                for (i in 0 until channelsArray.length()) {
                    val obj = channelsArray.getJSONObject(i)
                    channels.add(
                        DiscussionChannel(
                            obj.getString("channelKey"),
                            obj.getString("displayName"),
                            obj.getString("language")
                        )
                    )
                }
                _state.value = _state.value.copy(
                    channels = channels,
                    selectedChannelId = channels.firstOrNull()?.id,
                    isLoading = false
                )
                if (channels.isNotEmpty()) {
                    loadMessages(channels[0].id, apiClient, localization)
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(isLoading = false, error = e.message)
            }
        }
    }

    fun loadMessages(channelId: String, apiClient: com.audiobook.core.network.ApiClient, localization: LocalizationService) {
        viewModelScope.launch {
            try {
                val response = apiClient.getJson("api/v1/discussions/$channelId/messages?language=${localization.currentLocale}")
                val messagesArray = JSONArray(response)
                val messages = mutableListOf<DiscussionMessage>()
                for (i in 0 until messagesArray.length()) {
                    val obj = messagesArray.getJSONObject(i)
                    messages.add(
                        DiscussionMessage(
                            obj.getString("messageId"),
                            obj.getString("text"),
                            obj.optString("senderName", "Anonymous"),
                            obj.getString("createdAt")
                        )
                    )
                }
                _state.value = _state.value.copy(messages = messages)
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    fun selectChannel(channelId: String, apiClient: com.audiobook.core.network.ApiClient, localization: LocalizationService) {
        _state.value = _state.value.copy(selectedChannelId = channelId)
        loadMessages(channelId, apiClient, localization)
    }

    fun updateMessageInput(text: String) {
        _state.value = _state.value.copy(messageInput = text)
    }
}

@Composable
fun DiscussionsScreen(state: DiscussionUiState, viewModel: DiscussionViewModel) {
    Column(modifier = Modifier.fillMaxSize().padding(20.dp)) {
        Text("Discussions", style = MaterialTheme.typography.headlineSmall, color = Color(0xFFF4ECD9))

        if (state.isLoading) {
            CircularProgressIndicator(modifier = Modifier.padding(top = 20.dp))
        } else if (state.error != null) {
            Text(state.error, color = Color.Red, modifier = Modifier.padding(top = 20.dp))
        } else if (state.channels.isEmpty()) {
            Text("No discussions available.", color = Color(0xFFB8AE97), modifier = Modifier.padding(top = 20.dp))
        } else {
            // Channel selector
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                state.channels.forEach { channel ->
                    Button(
                        onClick = { viewModel.selectChannel(channel.id, com.audiobook.core.network.ApiClient(""), LocalizationService.getInstance(android.app.Application())) },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (state.selectedChannelId == channel.id) Color(0xFFFF8C00) else Color(0xFF191919),
                            contentColor = Color(0xFFF4ECD9)
                        ),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(channel.language.uppercase(), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }

            // Message list
            LazyColumn(modifier = Modifier.weight(1f).padding(top = 12.dp)) {
                items(state.messages) { msg ->
                    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF191919)), modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBetween) {
                                Text(msg.senderName ?: "Anonymous", style = MaterialTheme.typography.labelSmall, color = Color(0xFFFF8C00))
                                Text(msg.timestamp.take(10), style = MaterialTheme.typography.labelSmall, color = Color(0xFFB8AE97))
                            }
                            Text(msg.text, modifier = Modifier.padding(top = 8.dp), color = Color(0xFFF4ECD9))
                        }
                    }
                }
            }

            // Message composer
            Row(modifier = Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = state.messageInput,
                    onValueChange = { viewModel.updateMessageInput(it) },
                    placeholder = { Text("Message...") },
                    modifier = Modifier.weight(1f)
                )
                Button(onClick = { /* Send message */ }, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF8C00))) {
                    Text("Send")
                }
            }
        }
    }
}

