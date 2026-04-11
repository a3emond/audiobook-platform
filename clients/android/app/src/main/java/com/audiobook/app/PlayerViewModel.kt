package com.audiobook.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.audiobook.core.domain.PlayerChapter
import com.audiobook.core.domain.PlayerRepository
import com.audiobook.core.realtime.RealtimeClient
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject

data class PlayerUiState(
    val bookId: String = "",
    val title: String = "",
    val author: String? = null,
    val coverPath: String? = null,
    val streamPath: String? = null,
    val positionSeconds: Double = 0.0,
    val durationSeconds: Double = 0.0,
    val backwardJumpSeconds: Int = 10,
    val forwardJumpSeconds: Int = 30,
    val playbackRate: Double = 1.0,
    val appliedRewind: Boolean = false,
    val chapters: List<PlayerChapter> = emptyList(),
    val currentChapterIndex: Int = 0,
    val isPlaying: Boolean = false,
    val activeDeviceLabel: String? = null,
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val errorMessage: String? = null
)

class PlayerViewModel(private val repository: PlayerRepository) : ViewModel() {
    private val _state = MutableStateFlow(PlayerUiState())
    val state: StateFlow<PlayerUiState> = _state.asStateFlow()
    private var userId: String? = null
    private var deviceId: String? = null
    private var deviceLabel: String = "Android App"
    private var realtimeClient: RealtimeClient? = null
    private var lastClaimTimeMs: Long = 0
    private var presenceJob: Job? = null
    private var autosaveJob: Job? = null

    fun bindRealtime(userId: String?, deviceId: String, deviceLabel: String, client: RealtimeClient) {
        this.userId = userId
        this.deviceId = deviceId
        this.deviceLabel = deviceLabel
        this.realtimeClient = client

        client.connect { type, payload ->
            when (type) {
                "progress.synced" -> onProgressSynced(payload)
                "playback.claimed" -> onPlaybackClaimed(payload)
                "playback.session.presence" -> onPresence(payload)
            }
        }

        presenceJob?.cancel()
        presenceJob = viewModelScope.launch {
            while (true) {
                delay(10_000)
                broadcastPresence()
            }
        }
    }

    fun loadPlayer(bookId: String, title: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(
                isLoading = true,
                errorMessage = null,
                bookId = bookId,
                title = title
            )
            try {
                val settings = repository.fetchSettings()
                val resume = repository.loadResume(bookId)
                val snapshot = repository.fetchProgress(bookId)
                val details = repository.fetchPlaybackDetails(bookId)
                val authoritativePosition = snapshot?.positionSeconds?.toDouble() ?: resume.startSeconds
                val authoritativeDuration = snapshot?.durationAtSave?.takeIf { it > 0 }?.toDouble() ?: resume.durationSeconds
                _state.value = _state.value.copy(
                    isLoading = false,
                    streamPath = resume.streamPath,
                    author = details.author,
                    coverPath = details.coverPath,
                    positionSeconds = authoritativePosition,
                    durationSeconds = authoritativeDuration,
                    backwardJumpSeconds = settings.backwardJumpSeconds,
                    forwardJumpSeconds = settings.forwardJumpSeconds,
                    playbackRate = settings.playbackRate,
                    appliedRewind = resume.appliedRewind,
                    chapters = details.chapters,
                    currentChapterIndex = chapterIndexForPosition(details.chapters, authoritativePosition)
                )
                broadcastPresence()
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isLoading = false,
                    errorMessage = "Could not load playback data."
                )
            }
        }
    }

    fun updatePosition(value: Double) {
        val chapters = _state.value.chapters
        _state.value = _state.value.copy(
            positionSeconds = value,
            currentChapterIndex = chapterIndexForPosition(chapters, value)
        )
        broadcastProgress()
    }

    fun handleSkipBackwardAction() {
        seekBy(-_state.value.backwardJumpSeconds)
    }

    fun handleSkipForwardAction() {
        seekBy(_state.value.forwardJumpSeconds)
    }

    fun selectChapter(index: Int) {
        val chapter = _state.value.chapters.getOrNull(index) ?: return
        updatePosition(chapter.startSeconds)
    }

    private fun seekBy(deltaSeconds: Int) {
        val current = _state.value
        updatePosition((current.positionSeconds + deltaSeconds).coerceAtLeast(0.0))
    }

    fun playPressed() {
        _state.value = _state.value.copy(isPlaying = true, activeDeviceLabel = null)
        claimPlaybackOwnership()
        broadcastPresence()
        startAutosaveLoop()
    }

    fun pausePressed() {
        _state.value = _state.value.copy(isPlaying = false)
        broadcastPresence()
        stopAutosaveLoop()
        saveProgressSilently()
    }

    fun syncFromEngine(positionSeconds: Double, durationSeconds: Double) {
        val current = _state.value
        if (current.bookId.isBlank()) {
            return
        }

        _state.value = _state.value.copy(
            positionSeconds = positionSeconds.coerceAtLeast(0.0),
            durationSeconds = if (durationSeconds > 0) durationSeconds else current.durationSeconds,
            currentChapterIndex = chapterIndexForPosition(current.chapters, positionSeconds)
        )
        broadcastProgress()
    }

    fun saveProgress() {
        val current = _state.value
        if (current.bookId.isBlank() || current.durationSeconds <= 0) {
            return
        }

        viewModelScope.launch {
            _state.value = _state.value.copy(isSaving = true, errorMessage = null)
            try {
                repository.saveProgress(
                    bookId = current.bookId,
                    positionSeconds = current.positionSeconds.toInt(),
                    durationAtSave = current.durationSeconds.toInt().coerceAtLeast(1)
                )
                _state.value = _state.value.copy(isSaving = false)
                broadcastProgress()
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isSaving = false,
                    errorMessage = "Could not save progress."
                )
            }
        }
    }

    fun reset() {
        stopAutosaveLoop()
        _state.value = PlayerUiState()
    }

    private fun onProgressSynced(payload: JSONObject) {
        val current = _state.value
        val payloadUser = payload.optString("userId")
        val payloadBook = payload.optString("bookId")
        if (payloadUser != userId || payloadBook != current.bookId || current.isPlaying) {
            return
        }

        viewModelScope.launch {
            val snapshot = repository.fetchProgress(current.bookId) ?: return@launch
            _state.value = _state.value.copy(
                positionSeconds = snapshot.positionSeconds.toDouble(),
                durationSeconds = if (snapshot.durationAtSave > 0) snapshot.durationAtSave.toDouble() else current.durationSeconds,
                currentChapterIndex = chapterIndexForPosition(current.chapters, snapshot.positionSeconds.toDouble())
            )
        }
    }

    private fun onPlaybackClaimed(payload: JSONObject) {
        val payloadUser = payload.optString("userId")
        val payloadDevice = payload.optString("deviceId")
        val payloadBook = payload.optString("bookId")
        val timestamp = payload.optString("timestamp")
        val claimTime = runCatching { java.time.Instant.parse(timestamp).toEpochMilli() }.getOrDefault(0L)
        if (payloadUser != userId || payloadBook != _state.value.bookId || claimTime < lastClaimTimeMs) {
            return
        }

        lastClaimTimeMs = claimTime
        if (payloadDevice != deviceId && _state.value.isPlaying) {
            stopAutosaveLoop()
            _state.value = _state.value.copy(
                isPlaying = false,
                activeDeviceLabel = _state.value.activeDeviceLabel ?: "another device"
            )
        }
    }

    private fun onPresence(payload: JSONObject) {
        val payloadUser = payload.optString("userId")
        val payloadDevice = payload.optString("deviceId")
        val paused = payload.optBoolean("paused", true)
        val label = payload.optString("label", "another device")
        if (payloadUser != userId || payloadDevice == deviceId) {
            return
        }

        if (!paused) {
            _state.value = _state.value.copy(activeDeviceLabel = label)
        }
    }

    private fun broadcastPresence() {
        val current = _state.value
        val uid = userId ?: return
        val did = deviceId ?: return
        realtimeClient?.send(
            type = "playback.session.presence",
            payload = JSONObject()
                .put("userId", uid)
                .put("deviceId", did)
                .put("label", deviceLabel)
                .put("platform", "android")
                .put("currentBookId", if (current.bookId.isBlank()) JSONObject.NULL else current.bookId)
                .put("paused", !current.isPlaying)
        )
    }

    private fun claimPlaybackOwnership() {
        val current = _state.value
        val uid = userId ?: return
        val did = deviceId ?: return
        if (current.bookId.isBlank()) {
            return
        }

        val now = java.time.Instant.now().toString()
        lastClaimTimeMs = java.time.Instant.parse(now).toEpochMilli()
        realtimeClient?.send(
            type = "playback.claim",
            payload = JSONObject()
                .put("userId", uid)
                .put("deviceId", did)
                .put("bookId", current.bookId)
                .put("timestamp", now)
        )
    }

    private fun broadcastProgress() {
        val current = _state.value
        val uid = userId ?: return
        if (current.bookId.isBlank() || current.durationSeconds <= 0) {
            return
        }

        realtimeClient?.send(
            type = "playback.progress",
            payload = JSONObject()
                .put("userId", uid)
                .put("bookId", current.bookId)
                .put("positionSeconds", current.positionSeconds.toInt())
                .put("durationAtSave", current.durationSeconds.toInt())
                .put("completed", current.positionSeconds.toInt() >= (current.durationSeconds.toInt() - 1).coerceAtLeast(0))
                .put("timestamp", java.time.Instant.now().toString())
        )
    }

    private fun startAutosaveLoop() {
        autosaveJob?.cancel()
        autosaveJob = viewModelScope.launch {
            while (true) {
                delay(15_000)
                saveProgressSilently()
            }
        }
    }

    private fun stopAutosaveLoop() {
        autosaveJob?.cancel()
        autosaveJob = null
    }

    private fun saveProgressSilently() {
        val current = _state.value
        if (current.bookId.isBlank() || current.durationSeconds <= 0) {
            return
        }

        viewModelScope.launch {
            runCatching {
                repository.saveProgress(
                    bookId = current.bookId,
                    positionSeconds = current.positionSeconds.toInt(),
                    durationAtSave = current.durationSeconds.toInt().coerceAtLeast(1)
                )
            }
            broadcastProgress()
        }
    }

    override fun onCleared() {
        presenceJob?.cancel()
        autosaveJob?.cancel()
        realtimeClient?.disconnect()
        super.onCleared()
    }

    private fun chapterIndexForPosition(chapters: List<PlayerChapter>, positionSeconds: Double): Int {
        if (chapters.isEmpty()) {
            return 0
        }

        val normalizedPosition = positionSeconds.coerceAtLeast(0.0)
        return chapters.indexOfLast { chapter ->
            normalizedPosition >= chapter.startSeconds &&
                (chapter.endSeconds <= chapter.startSeconds || normalizedPosition < chapter.endSeconds)
        }.takeIf { it >= 0 } ?: chapters.lastIndex.coerceAtLeast(0).takeIf {
            normalizedPosition >= chapters.last().startSeconds
        } ?: 0
    }
}
