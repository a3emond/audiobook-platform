package com.audiobook.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color as AndroidColor
import android.os.Bundle
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
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
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import com.audiobook.core.auth.AuthSessionManager
import com.audiobook.core.data.AuthRepositoryImpl
import com.audiobook.core.data.LibraryRepositoryImpl
import com.audiobook.core.data.PlayerRepositoryImpl
import com.audiobook.core.network.ApiClient
import com.audiobook.core.network.ApiException
import com.audiobook.core.realtime.RealtimeClient
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID

class MainActivity : ComponentActivity() {
    private val gatewayBaseUrl = "https://audiobook.aedev.pro"
    private val apiClient by lazy { ApiClient(gatewayBaseUrl) }
    private val realtimeClient by lazy { RealtimeClient(gatewayBaseUrl) }
    private val sessionManager by lazy { AuthSessionManager.create(applicationContext) }
    private val authRepository by lazy { AuthRepositoryImpl(apiClient, sessionManager) }
    private val libraryRepository by lazy { LibraryRepositoryImpl(apiClient, authRepository, sessionManager) }
    private val playerRepository by lazy { PlayerRepositoryImpl(apiClient, authRepository, sessionManager) }
    private val localizationService by lazy { LocalizationService.getInstance(applicationContext) }
    private val exoPlayer by lazy { ExoPlayer.Builder(this).build() }
    private val mediaSession by lazy { MediaSession.Builder(this, exoPlayer).build() }

    private val authViewModel: AuthViewModel by viewModels { AuthViewModelFactory(authRepository) }
    private val libraryViewModel: LibraryViewModel by viewModels { LibraryViewModelFactory(libraryRepository) }
    private val playerViewModel: PlayerViewModel by viewModels { PlayerViewModelFactory(playerRepository) }
    private val discussionViewModel: DiscussionViewModel by viewModels()
    private val profileViewModel: ProfileViewModel by viewModels()

    override fun onStop() {
        super.onStop()
        exoPlayer.pause()
        playerViewModel.pausePressed()
    }

    override fun onDestroy() {
        mediaSession.release()
        exoPlayer.release()
        super.onDestroy()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    background = Color(0xFF070707),
                    surface = Color(0xFF121212),
                    surfaceVariant = Color(0xFF191919),
                    primary = Color(0xFFFF8C00),
                    secondary = Color(0xFFFFA12E),
                    onBackground = Color(0xFFF4ECD9),
                    onSurface = Color(0xFFF4ECD9),
                    onPrimary = Color(0xFFFFFFFF),
                )
            ) {
                val authState by authViewModel.state.collectAsState()
                val libraryState by libraryViewModel.state.collectAsState()
                val playerState by playerViewModel.state.collectAsState()
                val discussionState by discussionViewModel.state.collectAsState()
                val profileState by profileViewModel.state.collectAsState()
                var selectedBookId by remember { mutableStateOf<String?>(null) }
                var selectedTab by remember { mutableStateOf(0) } // 0=Library, 1=Discussions, 2=Profile
                var splashDone by remember { mutableStateOf(false) }
                var isApiReachable by remember { mutableStateOf<Boolean?>(null) }
                var apiReachabilityError by remember { mutableStateOf<String?>(null) }
                val coroutineScope = rememberCoroutineScope()
                val playbackDeviceId = remember {
                    val prefs = applicationContext.getSharedPreferences("playback", MODE_PRIVATE)
                    prefs.getString("device_id", null) ?: UUID.randomUUID().toString().also {
                        prefs.edit().putString("device_id", it).apply()
                    }
                }

                fun triggerHealthCheck() {
                    coroutineScope.launch {
                        isApiReachable = null
                        apiReachabilityError = null

                        runCatching { apiClient.getJson("api/v1/health") }
                            .onSuccess { isApiReachable = true }
                            .onFailure { error ->
                                isApiReachable = false
                                apiReachabilityError = apiReachabilityMessage(error)
                            }
                    }
                }

                LaunchedEffect(Unit) {
                    triggerHealthCheck()
                    delay(1000)
                    splashDone = true
                }

                LaunchedEffect(authState.isAuthenticated) {
                    if (authState.isAuthenticated) {
                        playerViewModel.bindRealtime(
                            userId = sessionManager.userId,
                            deviceId = playbackDeviceId,
                            deviceLabel = "Android App",
                            client = realtimeClient
                        )
                        libraryViewModel.loadLibrary(localizationService)
                        discussionViewModel.loadChannels(apiClient, sessionManager.accessToken ?: "", localizationService)
                        profileViewModel.loadProfile(sessionManager.userId, sessionManager.userEmail ?: "", localizationService)
                    }
                }

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color(0xFF0A0A0A),
                                    Color(0xFF070707),
                                    Color(0xFF050505)
                                )
                            )
                        )
                ) {
                    if (!splashDone || isApiReachable == null) {
                        SplashView(
                            statusText = if (splashDone) "Checking API reachability..." else "Loading your library..."
                        )
                    } else if (isApiReachable == false) {
                        ApiUnavailableScreen(
                            message = apiReachabilityError ?: "API is unreachable. Check your connection and try again.",
                            onRetry = ::triggerHealthCheck
                        )
                    } else if (!authState.isAuthenticated) {
                        LoginScreen(authState, authViewModel)
                    } else if (selectedBookId != null) {
                        PlayerScreen(
                            state = playerState,
                            onBack = {
                                exoPlayer.pause()
                                selectedBookId = null
                                playerViewModel.pausePressed()
                                playerViewModel.reset()
                            },
                            onTogglePlay = {
                                if (playerState.isPlaying) {
                                    exoPlayer.pause()
                                    playerViewModel.pausePressed()
                                } else {
                                    exoPlayer.playWhenReady = true
                                    exoPlayer.play()
                                    playerViewModel.playPressed()
                                }
                            },
                            onSeekTo = { targetSeconds ->
                                exoPlayer.seekTo((targetSeconds * 1000).toLong().coerceAtLeast(0L))
                                playerViewModel.syncFromEngine(
                                    positionSeconds = exoPlayer.currentPosition.coerceAtLeast(0L) / 1000.0,
                                    durationSeconds = exoPlayer.duration.takeIf { it > 0 }?.div(1000.0) ?: playerState.durationSeconds
                                )
                            },
                            onSelectChapter = { chapterIndex ->
                                val chapter = playerState.chapters.getOrNull(chapterIndex) ?: return@PlayerScreen
                                exoPlayer.seekTo((chapter.startSeconds * 1000).toLong().coerceAtLeast(0L))
                                playerViewModel.selectChapter(chapterIndex)
                                playerViewModel.syncFromEngine(
                                    positionSeconds = exoPlayer.currentPosition.coerceAtLeast(0L) / 1000.0,
                                    durationSeconds = exoPlayer.duration.takeIf { it > 0 }?.div(1000.0) ?: playerState.durationSeconds
                                )
                            },
                            onMediaAction = { action ->
                                when (action) {
                                    PlayerMediaAction.SkipBackward -> {
                                        playerViewModel.handleSkipBackwardAction()
                                        exoPlayer.seekBack()
                                    }
                                    PlayerMediaAction.SkipForward -> {
                                        playerViewModel.handleSkipForwardAction()
                                        exoPlayer.seekForward()
                                    }
                                }
                                playerViewModel.syncFromEngine(
                                    positionSeconds = exoPlayer.currentPosition.coerceAtLeast(0L) / 1000.0,
                                    durationSeconds = exoPlayer.duration.takeIf { it > 0 }?.div(1000.0) ?: playerState.durationSeconds
                                )
                            },
                            onPlaybackStateChanged = { isPlaying ->
                                if (isPlaying) {
                                    exoPlayer.playWhenReady = true
                                    exoPlayer.play()
                                } else {
                                    exoPlayer.pause()
                                }
                            },
                            onSave = { playerViewModel.saveProgress() },
                            onSignOut = {
                                exoPlayer.pause()
                                authViewModel.signOut()
                                selectedBookId = null
                                playerViewModel.pausePressed()
                                playerViewModel.reset()
                            },
                            onAttachStream = { streamPath, resumeAt ->
                                val mediaUrl = "$gatewayBaseUrl$streamPath"
                                val coverUri = if (!playerState.coverPath.isNullOrBlank()) {
                                    Uri.parse("$gatewayBaseUrl/streaming/books/${playerState.bookId}/cover")
                                } else {
                                    null
                                }
                                val mediaMetadata = MediaMetadata.Builder()
                                    .setTitle(playerState.title)
                                    .setArtist(playerState.author ?: "Unknown author")
                                    .setArtworkData(buildFallbackArtworkData())
                                    .setArtworkUri(coverUri)
                                    .build()
                                exoPlayer.setMediaItem(
                                    MediaItem.Builder()
                                        .setUri(mediaUrl)
                                        .setMediaMetadata(mediaMetadata)
                                        .build()
                                )
                                exoPlayer.prepare()
                                exoPlayer.seekTo((resumeAt * 1000).toLong().coerceAtLeast(0L))
                                exoPlayer.setPlaybackParameters(PlaybackParameters(playerState.playbackRate.toFloat()))
                            },
                            onSyncTick = {
                                val position = exoPlayer.currentPosition.coerceAtLeast(0L) / 1000.0
                                val duration = exoPlayer.duration.takeIf { it > 0 }?.div(1000.0) ?: playerState.durationSeconds
                                playerViewModel.syncFromEngine(position, duration)
                            },
                            onApplyPlaybackRate = { rate ->
                                exoPlayer.setPlaybackParameters(PlaybackParameters(rate.toFloat()))
                            },
                            onApplySeekIncrements = { backwardSeconds, forwardSeconds ->
                                exoPlayer.setSeekBackIncrementMs(backwardSeconds.coerceAtLeast(1) * 1000L)
                                exoPlayer.setSeekForwardIncrementMs(forwardSeconds.coerceAtLeast(1) * 1000L)
                            }
                        )
                    } else {
                        Column(modifier = Modifier.fillMaxSize()) {
                            // Tab Navigation
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Color(0xFF191919))
                                    .padding(8.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                listOf("Library", "Discussions", "Profile").forEachIndexed { index, label ->
                                    Button(
                                        onClick = { selectedTab = index },
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = if (selectedTab == index) Color(0xFFFF8C00) else Color(0xFF121212),
                                            contentColor = Color(0xFFF4ECD9)
                                        ),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Text(label, style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                            }

                            // Tab Content
                            when (selectedTab) {
                                0 -> LibraryScreen(
                                    state = libraryState,
                                    onOpenBook = { id, title ->
                                        selectedBookId = id
                                        playerViewModel.loadPlayer(id, title)
                                        playerViewModel.pausePressed()
                                    },
                                    onRetry = { libraryViewModel.loadLibrary(localizationService) },
                                    onSignOut = {
                                        authViewModel.signOut()
                                        selectedBookId = null
                                        selectedTab = 0
                                        playerViewModel.pausePressed()
                                        playerViewModel.reset()
                                    }
                                )
                                1 -> DiscussionsScreen(state = discussionState, viewModel = discussionViewModel)
                                2 -> ProfileScreen(
                                    state = profileState,
                                    viewModel = profileViewModel,
                                    onSignOut = {
                                        authViewModel.signOut()
                                        selectedBookId = null
                                        selectedTab = 0
                                        playerViewModel.pausePressed()
                                        playerViewModel.reset()
                                    },
                                    localization = localizationService
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun buildFallbackArtworkData(): ByteArray {
    val bitmap = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(AndroidColor.rgb(36, 48, 76))

    return java.io.ByteArrayOutputStream().use { output ->
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
        output.toByteArray()
    }
}

private enum class PlayerMediaAction {
    SkipBackward,
    SkipForward
}

@Composable
private fun SplashView(statusText: String = "Loading your library...") {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Image(
            painter = painterResource(id = R.drawable.logo_small),
            contentDescription = "Audiobook",
            modifier = Modifier.size(132.dp),
            contentScale = ContentScale.Fit
        )
        Text(
            text = "Audiobook Platform",
            style = MaterialTheme.typography.headlineSmall,
            color = Color(0xFFF4ECD9),
            modifier = Modifier.padding(top = 14.dp)
        )
        Text(
            text = statusText,
            style = MaterialTheme.typography.bodyMedium,
            color = Color(0xFFB8AE97),
            modifier = Modifier.padding(top = 6.dp)
        )
    }
}

@Composable
private fun ApiUnavailableScreen(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Image(
            painter = painterResource(id = R.drawable.logo_small),
            contentDescription = "Audiobook",
            modifier = Modifier.size(120.dp),
            contentScale = ContentScale.Fit
        )
        Text(
            text = "Cannot Reach API",
            style = MaterialTheme.typography.headlineSmall,
            color = Color(0xFFF4ECD9),
            modifier = Modifier.padding(top = 14.dp)
        )
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = Color(0xFFB8AE97),
            modifier = Modifier.padding(top = 8.dp)
        )
        Button(
            onClick = onRetry,
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF8C00), contentColor = Color.White),
            modifier = Modifier.padding(top = 16.dp)
        ) {
            Text("Retry")
        }
    }
}

private fun apiReachabilityMessage(error: Throwable): String {
    return when (error) {
        is java.net.UnknownHostException -> "Could not resolve host. Verify internet access and gateway URL."
        is java.net.SocketTimeoutException -> "Connection timed out while contacting API."
        is ApiException -> "API responded with status ${error.statusCode}."
        else -> "Unable to reach API. Check your connection and try again."
    }
}

@Composable
private fun LoginScreen(state: AuthUiState, viewModel: AuthViewModel) {
    Column(modifier = Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Image(
            painter = painterResource(id = R.drawable.logo_small),
            contentDescription = "Audiobook",
            modifier = Modifier.size(84.dp),
            contentScale = ContentScale.Fit
        )
        Text("Sign In", style = MaterialTheme.typography.headlineSmall, color = Color(0xFFF4ECD9))
        Text("Welcome back to your library", style = MaterialTheme.typography.bodyMedium, color = Color(0xFFB8AE97))
        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF121212)), modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(value = state.email, onValueChange = viewModel::onEmailChanged, label = { Text("Email") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = state.password, onValueChange = viewModel::onPasswordChanged, label = { Text("Password") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        state.errorMessage?.let { Text(it, color = Color.Red) }
        Button(onClick = { viewModel.login() }, enabled = !state.isLoading && state.email.isNotBlank() && state.password.isNotBlank(), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF8C00), contentColor = Color.White), modifier = Modifier.fillMaxWidth()) {
            if (state.isLoading) CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
            Text("Login")
        }
            }
        }
    }
}

@Composable
private fun LibraryScreen(
    state: LibraryUiState,
    onOpenBook: (String, String) -> Unit,
    onRetry: () -> Unit,
    onSignOut: () -> Unit
) {
    Column(modifier = Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Image(painter = painterResource(id = R.drawable.logo_small), contentDescription = "Audiobook", modifier = Modifier.size(30.dp), contentScale = ContentScale.Fit)
            Text("Library", style = MaterialTheme.typography.headlineSmall, color = Color(0xFFF4ECD9))
        }
        if (state.isLoading) CircularProgressIndicator()
        state.errorMessage?.let {
            Text(it, color = Color.Red)
            TextButton(onClick = onRetry) { Text("Retry") }
        }
        if (!state.isLoading && state.errorMessage == null && state.books.isEmpty()) {
            Text("No books available.")
        }
        if (state.books.isNotEmpty()) {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.books, key = { it.id }) { book ->
                    Button(onClick = { onOpenBook(book.id, book.title) }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF191919), contentColor = Color(0xFFF4ECD9))) {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            Text(book.title, style = MaterialTheme.typography.titleMedium)
                            Text(book.author ?: "Unknown author", style = MaterialTheme.typography.bodySmall, color = Color(0xFFB8AE97))
                        }
                    }
                }
            }
        }
        TextButton(onClick = onSignOut) { Text("Sign Out") }
    }
}

@Composable
private fun PlayerScreen(
    state: PlayerUiState,
    onBack: () -> Unit,
    onTogglePlay: () -> Unit,
    onSeekTo: (Double) -> Unit,
    onSelectChapter: (Int) -> Unit,
    onMediaAction: (PlayerMediaAction) -> Unit,
    onPlaybackStateChanged: (Boolean) -> Unit,
    onSave: () -> Unit,
    onSignOut: () -> Unit,
    onAttachStream: (String, Double) -> Unit,
    onSyncTick: () -> Unit,
    onApplyPlaybackRate: (Double) -> Unit,
    onApplySeekIncrements: (Int, Int) -> Unit
) {
    LaunchedEffect(state.streamPath) {
        val path = state.streamPath
        if (!path.isNullOrBlank()) {
            onAttachStream(path, state.positionSeconds)
        }
    }

    LaunchedEffect(state.playbackRate) {
        onApplyPlaybackRate(state.playbackRate)
    }

    LaunchedEffect(state.backwardJumpSeconds, state.forwardJumpSeconds) {
        onApplySeekIncrements(state.backwardJumpSeconds, state.forwardJumpSeconds)
    }

    LaunchedEffect(state.isPlaying) {
        onPlaybackStateChanged(state.isPlaying)
    }

    LaunchedEffect(state.positionSeconds, state.isPlaying) {
        if (!state.isPlaying && state.durationSeconds > 0) {
            onSeekTo(state.positionSeconds)
        }
    }

    LaunchedEffect(state.isPlaying) {
        while (state.isPlaying) {
            kotlinx.coroutines.delay(1000)
            onSyncTick()
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        var chapterMenuExpanded by remember { mutableStateOf(false) }
        TextButton(onClick = onBack) { Text("Back", color = Color(0xFFFF8C00)) }
        Text(state.title, style = MaterialTheme.typography.headlineSmall)
        state.activeDeviceLabel?.let { Text("Currently playing on $it", color = Color(0xFF8A6D00)) }
        if (state.isLoading) CircularProgressIndicator()
        state.errorMessage?.let { Text(it, color = Color.Red) }
        if (state.appliedRewind) {
            Text("Resume rewind applied for context.", style = MaterialTheme.typography.bodySmall, color = Color(0xFF8A6D00))
        }
        state.streamPath?.let { Text("Stream: $it", style = MaterialTheme.typography.bodySmall) }
        if (state.chapters.isNotEmpty()) {
            Text("Chapter", style = MaterialTheme.typography.labelLarge)
            Button(onClick = { chapterMenuExpanded = true }, modifier = Modifier.fillMaxWidth()) {
                val chapter = state.chapters.getOrNull(state.currentChapterIndex)
                Text(chapter?.let { "${it.index + 1}. ${it.title}" } ?: "Select chapter")
            }
            androidx.compose.material3.DropdownMenu(
                expanded = chapterMenuExpanded,
                onDismissRequest = { chapterMenuExpanded = false }
            ) {
                state.chapters.forEachIndexed { index, chapter ->
                    androidx.compose.material3.DropdownMenuItem(
                        text = { Text("${chapter.index + 1}. ${chapter.title}") },
                        onClick = {
                            chapterMenuExpanded = false
                            onSelectChapter(index)
                        }
                    )
                }
            }
        }
        if (state.durationSeconds > 0) {
            OutlinedTextField(
                value = state.positionSeconds.toInt().toString(),
                onValueChange = { value -> value.toDoubleOrNull()?.let(onSeekTo) },
                label = { Text("Position (seconds)") },
                modifier = Modifier.fillMaxWidth()
            )
            Text("Duration: ${state.durationSeconds.toInt()}s", style = MaterialTheme.typography.bodySmall)
            Text("Speed: ${String.format("%.2fx", state.playbackRate)}", style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { onMediaAction(PlayerMediaAction.SkipBackward) }) {
                    Text("-${state.backwardJumpSeconds}s")
                }
                Button(onClick = { onMediaAction(PlayerMediaAction.SkipForward) }) {
                    Text("+${state.forwardJumpSeconds}s")
                }
            }
        }
        Button(onClick = onTogglePlay) { Text(if (state.isPlaying) "Pause (Release Control)" else "Play (Take Control)") }
        Button(onClick = onSave, enabled = !state.isSaving && state.durationSeconds > 0, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF8C00), contentColor = Color.White)) {
            if (state.isSaving) CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
            Text("Save Progress")
        }
        TextButton(onClick = onSignOut) { Text("Sign Out") }
    }
}
