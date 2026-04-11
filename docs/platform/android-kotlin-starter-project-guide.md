# Android Native Starter Project Guide (Kotlin Core + Compose)

Purpose:

- Provide a complete starter blueprint for Android native client delivery.
- Enforce MVVM with a dedicated Kotlin core layer.
- MVP scope: 4 core features (Library, Player, Discussions, Profile) with language detection and i18n.

Scope:

- Included: module structure, dependencies, architecture contracts, testing, CI, rollout.
- Excluded: backend endpoint payload internals.

MVP Features Implemented:

- **Authentication**: Login/session/logout with health gate on startup
- **Library**: Browse language-filtered books, select to play
- **Player**: ExoPlayer integration, pause, seek, skip, chapters, playback rate, progress tracking, MediaSession
- **Discussions**: Browse language-scoped channels, view/send messages
- **Profile**: User info, language toggle, sign-out
- **Localization**: System language detection, LocalizationService, language-aware API queries

Related docs:

- [Native Platform Implementation Guide](./native-platform-implementation-guide.md)
- [Mobile Native MVVM Guide](./mobile-native-mvvm-guide.md)
- [Frontend Client Integration Guideline](./frontend-client-integration-guideline.md)
- [Frontend Client Certification Checklist](./frontend-client-certification-checklist.md)

## 1. Actual Repository Layout

```text
clients/
  android/
    README.md                          # Client-specific documentation
    settings.gradle.kts
    build.gradle.kts
    gradle/
    app/
      build.gradle.kts
      src/main/
        AndroidManifest.xml
        java/com/audiobook/app/
          MainActivity.kt              # Root activity with TabView (4 tabs)
          AuthViewModel.kt
          LibraryViewModel.kt
          PlayerViewModel.kt           # ExoPlayer integration
          DiscussionViewModel.kt
          ProfileViewModel.kt
          LocalizationService.kt       # Device lang detection, i18n
    core-domain/
      build.gradle.kts
      src/main/java/com/audiobook/core/domain/
        LibraryRepository.kt           # Interface
        PlayerRepository.kt
        AuthRepository.kt
        BookItem.kt                    # Domain model
    core-data/
      build.gradle.kts
      src/main/java/com/audiobook/core/data/
        LibraryRepositoryImpl.kt        # Language parameter support
        PlayerRepositoryImpl.kt
        AuthRepositoryImpl.kt
        AuthorizedRequestExecutor.kt   # 1-retry on 401
        dto/
    core-network/
      build.gradle.kts
      src/main/java/com/audiobook/core/network/
        ApiClient.kt                   # OkHttp + Retrofit/JsonObject
    core-auth/
      build.gradle.kts
      src/main/java/com/audiobook/core/auth/
        AuthSessionManager.kt          # SharedPreferences token store
    core-realtime/
      build.gradle.kts
      src/main/java/com/audiobook/core/realtime/
        RealtimeClient.kt              # WebSocket ready
    benchmark/
    tests/
```

## 2. Build Variants and Environments

Build types:

- debug
- release

Product flavors:

- dev
- staging
- prod

Config fields per flavor:

- API_BASE_URL
- STREAMING_BASE_URL
- WS_BASE_URL
- LOG_LEVEL

Signing:

- release signing via CI secret-managed keystore
- Local signing: generate keystore, store credentials in local.properties (not committed)

## 3. Dependency Baseline

Core libraries:

- Kotlin Coroutines + Flow
- Jetpack Compose (Material3)
- Navigation Compose (for future multi-screen if needed)
- Retrofit + OkHttp (or JsonObject for raw JSON parsing)
- DataStore + EncryptedSharedPreferences (or SharedPreferences for dev)
- Media3 (ExoPlayer + MediaSession)
- Coil for images (or Glide)
- Timber or Log for logging

Testing:

- JUnit 4/5
- Turbine for Flow testing
- MockWebServer (OkHttp)
- Compose UI test

Rules:

- No reflection-heavy DI required for MVP (no Hilt dependency).
- Keep module boundaries explicit.
- Use direct instantiation or simple factory pattern for dependency creation.

## 4. App Architecture Contracts

Mandatory layering:

1. **core-network**: HTTP client, interceptors, DTO parsing
2. **core-auth**: Session/token management
3. **core-domain + core-data**: Repository interfaces and implementations
4. **app**: Presentation (MVVM + Compose), UI state, intents
5. **Platform adapters**: Media session, focus, lifecycle hooks

MVVM contract:

- **ViewModel state**: `StateFlow<UiState>` (single source of truth)
- **ViewModel intentions**: `fun onUserAction(...) { }`
- **Views**: Observe state, call ViewModel intents on user event
- **No API calls in Views**: Route through ViewModel → Repository → ApiClient

## 5. Core Modules in Detail

### app/MainActivity.kt (Presentation)

```kotlin
class MainActivity : ComponentActivity() {
    private val apiClient by lazy { ApiClient(baseUrl) }
    private val sessionManager by lazy { AuthSessionManager.create(this) }
    private val localizationService by lazy { LocalizationService.getInstance(this) }

    private val authViewModel by viewModels { AuthViewModelFactory(...) }
    private val libraryViewModel by viewModels { LibraryViewModelFactory(...) }
    private val playerViewModel by viewModels { PlayerViewModelFactory(...) }
    private val discussionViewModel by viewModels()
    private val profileViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        setContent {
            // Health gate check
            // TabView(4 tabs) when authenticated
        }
    }
}
```

Key responsibilities:

- UI root composition
- ViewModel instantiation
- Lifecycle management (onStop, onDestroy for ExoPlayer)
- Health gate on startup

### core-network/ApiClient.kt

```kotlin
class ApiClient(baseUrl: String) {
    fun getJson<T>(path: String): T
    fun postJson<T>(path: String, body: Any): T
    // Query params: append to path "api/v1/books?language=en"
}
```

Features:

- Base URL management per flavor
- OkHttp client setup
- Request/response logging (without secrets)
- Automatic 401/403 detection (handled by core-data layer)

### core-auth/AuthSessionManager.kt

```kotlin
class AuthSessionManager {
    var accessToken: String?
    var refreshToken: String?
    var userId: String
    var userEmail: String?

    fun updateTokens(access: String, refresh: String)
    fun clear()
}
```

Storage: SharedPreferences (standard) or EncryptedSharedPreferences (recommended).

### Localization (NEW CoreModule)

```kotlin
class LocalizationService(context: Context) {
    var currentLocale: String  // "en" or "fr"
    fun translate(key: String, fallback: String): String
}
```

Behavior:

- On init: detect system language, fall back to saved, default to "en"
- Built-in dictionaries for en/fr (no external JSON)
- Exposes locale via property, change triggers UI refresh in ViewModels

### core-data Repositories

**LibraryRepositoryImpl:**

```kotlin
override suspend fun listBooks(language: String): List<BookItem> {
    return apiClient.getJson("api/v1/books?language=$language")
}
```

**PlayerRepositoryImpl:**

```kotlin
override suspend fun getBook(id: String): BookDetailDTO
override suspend fun saveProgress(bookId: String, position: Double): Unit
```

**AuthRepositoryImpl:**

```kotlin
override suspend fun login(email: String, password: String): Unit
override suspend fun signOut(): Unit
override suspend fun refreshSession(): Unit
```

**AuthorizedRequestExecutor:**

- Wraps API calls with automatic 401 refresh
- One retry attempt on refresh success
- Force logout if refresh fails

## 6. MVVM State Pattern

```kotlin
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
            _state.value = _state.value.copy(isLoading = true)
            try {
                val books = repository.listBooks(localization.currentLocale)
                _state.value = _state.value.copy(books = books, isLoading = false)
            } catch (e: Exception) {
                _state.value = _state.value.copy(errorMessage = e.message, isLoading = false)
            }
        }
    }
}
```

In Compose:

```kotlin
@Composable
fun LibraryScreen(viewModel: LibraryViewModel) {
    val state by viewModel.state.collectAsState()

    when {
        state.isLoading -> CircularProgressIndicator()
        state.errorMessage != null -> ErrorView(state.errorMessage)
        state.books.isEmpty() -> EmptyView()
        else -> BookList(state.books) { bookId -> viewModel.selectBook(bookId) }
    }
}
```

## 7. Navigation Structure (Compose TabView-based)

```
MainActivity (Root)
├── Health Gate Check
├── Login screen (not authenticated)
└── TabView (authenticated, 3 tabs)
    ├── Library Tab
    │   └── BookList
    │   └── Select book → PlayerScreen (modal)
    │
    ├── Discussions Tab
    │   ├── ChannelSelector
    │   ├── MessageList
    │   └── MessageComposer
    │
    └── Profile Tab
        ├── UserInfo card
        ├── LanguageToggle (En/Fr buttons)
        └── SignOutButton

PlayerScreen (Full-screen modal overlay)
├── Appears when book selected from Library
├── ExoPlayer controls, progress, chapters
└── Back button returns to Library tab
```

## 8. ExoPlayer Integration (Media3)

```kotlin
class MainActivity : ComponentActivity() {
    private val exoPlayer by lazy { ExoPlayer.Builder(this).build() }
    private val mediaSession by lazy { MediaSession.Builder(this, exoPlayer).build() }

    override fun onStop() {
        exoPlayer.pause()
    }

    override fun onDestroy() {
        mediaSession.release()
        exoPlayer.release()
    }

    // In PlayerViewModel:
    fun attachStream(streamUrl: String, resumeAt: Double) {
        val mediaItem = MediaItem.Builder().setUri(streamUrl).build()
        exoPlayer.setMediaItem(mediaItem)
        exoPlayer.seek((resumeAt * 1000).toLong())
        exoPlayer.prepare()
    }
}
```

Features:

- MediaSession for lock-screen controls
- Automatic Now Playing metadata
- Background audio continuation
- Media focus / Audio interruption handling

## 9. Startup Health Gate Flow

1. MainActivity onCreate
2. Splash view while checking API
3. Call `GET /api/v1/health`
4. **Success**: proceed to auth or home (TabView)
5. **Failure**: show `ApiUnavailableScreen` with retry button

Implementation:

```kotlin
fun triggerHealthCheck() {
    viewModelScope.launch {
        runCatching {
            apiClient.getJson<HealthResponse>("api/v1/health")
        }.onSuccess { isApiReachable = true }
         .onFailure { isApiReachable = false }
    }
}
```

## 10. Testing Strategy

**Unit tests (repository + ViewModel):**

```kotlin
@Test
fun loadLibrary_withFrench_includesLanguageParam() = runTest {
    val mockRepo = MockLibraryRepository()
    val viewModel = LibraryViewModel(mockRepo)

    viewModel.loadLibrary(LocalizationService(locale = "fr"))

    // Assert MockLibraryRepository.listBooks was called with "fr"
}
```

**Integration tests** (MockWebServer OpenStack):

```kotlin
@Test
fun apiClient_onLoginSuccess_storesToken() {
    server.enqueue(MockResponse().setBody("""{"accessToken":"ABC"}"""))
    apiClient.login(...)
    assert(sessionManager.accessToken == "ABC")
}
```

**UI tests** (Compose):

```kotlin
@Test
fun libraryScreen_withBooks_displaysBookList() {
    composeTestRule.setContent {
        LibraryScreen(fakeViewModel)
    }
    composeTestRule.onNodeWithText("Book Title").assertIsDisplayed()
}
```

## 11. Build and Release

### Debug Build

```bash
./gradlew assembleDebug
```

### Release Build (signed)

```bash
./gradlew assembleRelease
```

Requires `local.properties`:

```
STORE_FILE=/path/to/keystore
STORE_PASSWORD=***
KEY_ALIAS=***
KEY_PASSWORD=***
```

CI Release Signing:

```bash
./gradlew assembleRelease \
  -PSTORE_FILE=$ANDROID_KEYSTORE_PATH \
  -PSTORE_PASSWORD=$ANDROID_KEYSTORE_PASSWORD \
  -PKEY_ALIAS=$ANDROID_KEY_ALIAS \
  -PKEY_PASSWORD=$ANDROID_KEY_PASSWORD
```

Results in: `app/build/outputs/apk/release/app-release.apk`

## 12. Configuration Per Flavor

build.gradle.kts (app module):

```kotlin
flavorDimensions.add("environment")
productFlavors {
    create("dev") {
        dimension = "environment"
        buildConfigField("String", "API_BASE_URL", "\"http://localhost:8080\"")
    }
    create("staging") {
        dimension = "environment"
        buildConfigField("String", "API_BASE_URL", "\"https://staging.audiobook.local\"")
    }
    create("prod") {
        dimension = "environment"
        buildConfigField("String", "API_BASE_URL", "\"https://api.audiobook.app\"")
    }
}
```

All flavors share:

- Same MVVM architecture
- Same component implementations
- Differ only by API_BASE_URL, WS_BASE_URL, LOG_LEVEL (set in BuildConfig)

## 13. Error State Handling (Standardized)

All ViewModels must handle:

1. **Network unavailable**: Show offline banner, retry on reconnect
2. **401/403**: Refresh token if available, logout if refresh fails
3. **5XX error**: Show `ErrorScreen` with "try again" button
4. **Domain specific** (e.g., book not found): Show context-aware message

Pattern (in ViewModel):

```kotlin
private fun handleError(error: Exception) {
    when (error) {
        is NetworkException -> showOfflineBanner()
        is UnauthorizedException -> logout()
        is ServerException -> showErrorScreen(error.message)
        else -> showErrorSnackBar("Unknown error")
    }
}
```

## 14. Realtime Integration Points

WebSocket connection:

- Opened immediately after successful auth
- Subscribes to session channel: `session/{userId}`
- Receives system events + real-time message notifications

EventHandling (in RealtimeClient):

```kotlin
fun subscribeToSystemEvents(userId: String) {
    webSocket.send("subscribe", "{\"channel\": \"system/$userId\"}")
}

fun onWebSocketMessage(msg: String) {
    val envelope = parseEnvelope(msg)
    when (envelope.type) {
        "system.connected" -> handleConnected()
        "discussion.message.created" -> dispatch.emit(NewMessageEvent(...))
        else -> {}
    }
}
```

DiscussionViewModel observes `NewMessageEvent` via Flow and updates state.

## 15. Performance Targets (Android)

- **Cold start**: < 2.5 seconds (from launcher to UI visible)
- **Library list scroll**: 60 FPS smooth scroll on list of 500+ books
- **Player load**: < 500ms from book selection to player visible
- **Memory**: < 150 MB used at rest, < 200 MB during playback

Profiling:

```bash
./gradlew profileRelease  # Compile with perfetto tracing
adb shell am startperf  # Run perfetto profiler during test
```

## 16. Testing Baseline

Test coverage target: **minimum 60% core modules** (auth, storage, network)

Test command:

```bash
./gradlew testDebugUnitTest
./gradlew testDebugIntegrationTest
./gradlew connectedAndroidTest  # UI tests on emulator/device
```

Mock infrastructure:

- MockWebServer for HTTP integration tests
- FakeRepository implementations for ViewModel unit tests
- Turbine for Flow assertions

## 17. Development Workflow

Typical session:

1. Check out feature branch
2. Run `./gradlew build` to validate baseline
3. Implement feature with unit tests
4. Run `./gradlew testDebug` + `./gradlew connectedAndroidTest`
5. Test with `./gradlew installDebug` on physical device or emulator
6. Verify localization by toggling language in Profile screen
7. Create pull request with linked issue

Local environment setup:

```bash
# First time:
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk

# On code change:
./gradlew installDebug && adb shell am start -n com.audiobook.app/.MainActivity
```

## 18. Definition of Done (Per Feature)

A feature is **done** when:

- ✅ MVVM contract satisfied (ViewModel, UiState, View)
- ✅ Unit tests pass (repository + ViewModel)
- ✅ Integration tests pass (with MockWebServer)
- ✅ UI tests pass (navigation + loading/error states)
- ✅ Localization toggle tested (en/fr)
- ✅ Offline behavior tested (network unavailable)
- ✅ ExoPlayer integration (if media feature)
- ✅ Code reviewed, zero lint errors
- ✅ Changelog updated
- ✅ Added to [Frontend Client Certification Checklist](./frontend-client-certification-checklist.md)

## 19. Admin and Windows Desktop

**Mobile clients (Apple/Android) do NOT support admin features.**

Admin links:

- Profile screen includes link: "Go to Admin Console" → `https://yourdomain.app/admin`
- Directs to web console in browser

Windows desktop client:

- Planned for future phase
- Will support admin features (full web parity)
- Separate roadmap from mobile MVP

## 20. Next Steps After MVP

Post-launch features (not in scope for 4-feature MVP):

- Collections feature (curated book groups)
- Series support (sequential book grouping)
- Activity/History timeline
- Social features (followers, recommendations)
- Offline mode (pre-download books)

Each phase will extend the MVVM architecture with new ViewModel + Repository modules.
