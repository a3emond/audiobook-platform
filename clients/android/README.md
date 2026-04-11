# Android Client Workspace

Kotlin + Jetpack Compose modular Android architecture.

## Module Structure

```
clients/android/
├── app/                    # Application layer (UI/navigation)
│   └── src/main/java/com/audiobook/app/
│       ├── MainActivity.kt                 # Root activity & tab navigation
│       ├── AuthViewModel.kt                # Login/session management
│       ├── LibraryViewModel.kt             # Book listing & filtering
│       ├── PlayerViewModel.kt              # Playback control & progress
│       ├── DiscussionViewModel.kt          # Chat channels & messages
│       ├── ProfileViewModel.kt             # User profile & settings
│       └── LocalizationService.kt          # i18n & language switching
├── core-domain/            # Domain models & interfaces
│   └── LibraryRepository (interface)
├── core-data/              # Repository implementations
│   ├── LibraryRepositoryImpl
│   ├── PlayerRepositoryImpl
│   ├── AuthRepositoryImpl
│   └── AuthorizedRequestExecutor (1 retry on 401)
├── core-network/           # HTTP client & interceptors
│   └── ApiClient (baseURL + session headers)
├── core-auth/              # Session & token management
│   └── AuthSessionManager (SharedPreferences)
├── core-realtime/          # WebSocket integration
│   └── RealtimeClient (presence, progress, chat)
└── core-storage/           # Local persistence
    └── Cache layer (optional)
```

## Architecture

- **MVVM + Repository Pattern**:
  - Views → ViewModels → Repositories → ApiClient
- **Coroutines + Flow**: Async operations and reactive state
- **Jetpack Compose**: Single-activity, tab-based UI
- **Session persistence**: `SharedPreferences` for tokens
- **Error handling**: User-facing messages, graceful degradation
- **Lifecycle alignment**: ViewModel lifecycle matches fragment/activity

## Implemented Features

### 🔐 Authentication

- **Login**: Email/password → JWT tokens (access + refresh)
- **Session management**: Auto-refresh on 401/403 errors
- **Token storage**: Secure in `SharedPreferences` (consider `EncryptedSharedPreferences`)
- **Sign-out**: Clear tokens and reset app state
- **Health gate on startup**: Checks `/api/v1/health` before flows
- **Profile fetching**: `GET /api/v1/auth/me` for user details

### 📚 Library

- **Book listing**: Fetches from `/api/v1/books?language={locale}`
- **Language filtering**: Respects user's selected language
- **Book metadata**: Title, author, cover URL, description
- **Book selection**: Tap to open Player with streaming setup
- **Error states**: Displays "Could not load library" on failure
- **Retry logic**: User can manually reload library

### ▶️ Player

- **Audio streaming**: ExoPlayer integration with `/streaming/books/{id}`
- **Playback controls**: Play, pause, seek, skip back/forward
- **Progress tracking**: Syncs to server via WebSocket
- **Chapter navigation**: Load chapters, jump to position
- **Playback rates**: Adjustable speed control
- **MediaSession integration**: System controls, Now Playing updates
- **Cover art**: Book cover display with fallback gradient
- **Resume on demand**: Remembers last listened position per device

### 💬 Discussions (Chat)

- **Channel listing**: Load language-specific channels
- **Message history**: Fetch messages per channel with language filter
- **Message composition**: Type and send text to channels
- **Real-time ready**: WebSocket integration for live updates
- **Sender info**: Display username/timestamp for each message

### 👤 Profile

- **User account display**: Email, name, role, join date
- **Language toggle**: One-tap switching between English/Français
- **Auto-refresh**: Library and Discussions reload on language change
- **Sign-out**: Quick logout with confirmation flow

### 🌍 Localization & i18n

- **System language detection**: Fallback to saved preference or English
- **Persistent locale**: Stored in `SharedPreferences`
- **Translation service**: `LocalizationService` provides key-based strings
- **Language-aware API calls**: All queries include `?language={locale}`
- **Built-in translations**: English/French (no external JSON required initially)

### 🔄 Real-time Features (WebSocket Ready)

- **Player progress sync**: Cross-device resume capability
- **Live discussions**: Message streaming when fully integrated
- **Presence tracking**: See who's online (when wired)

## Gateway Configuration

Edit `MainActivity.kt` line ~65:

```kotlin
private val gatewayBaseUrl = "https://audiobook.aedev.pro"  // Production
// or
private val gatewayBaseUrl = "http://10.0.2.2:8100"        // Emulator → Host
```

**Note**: Use `10.0.2.2` inside Android emulator to reach localhost on host machine.

## Core Modules Deep Dive

### ApiClient (`core-network`)

```kotlin
class ApiClient(baseURL: String)

// Methods:
fun getJson<T>(path: String): T
fun postJson<T>(path: String, body: Any): T
fun putJson<T>(path: String, body: Any): T
fun patchJson<T>(path: String, body: Any): T
fun delete(path: String): Unit
```

Add query params directly to path:

```kotlin
apiClient.getJson<BooksResponse>("api/v1/books?language=en")
```

### AuthSessionManager (`core-auth`)

```kotlin
class AuthSessionManager {
    var accessToken: String?
    var refreshToken: String?
    var userId: String
    var userEmail: String?

    fun clear()
    fun updateTokens(access, refresh)
}
```

### Repositories (`core-data`)

**LibraryRepositoryImpl**:

```kotlin
override suspend fun listBooks(language: String): List<BookItem>
```

**PlayerRepositoryImpl**:

```kotlin
override suspend fun getBook(id: String): BookDetailDTO
override suspend fun saveProgress(bookId: String, position: Double): Unit
```

**AuthRepositoryImpl**:

```kotlin
override suspend fun login(email: String, password: String): Unit
override suspend fun signOut(): Unit
override suspend fun refreshSession(): Unit
```

### Localization Service

```kotlin
class LocalizationService(context: Context) {
    var currentLocale: String  // "en" or "fr"
    fun translate(key: String, fallback: String): String
}

// Usage in ViewModels:
localizationService.currentLocale  // Get current language
localizationService.currentLocale = "fr"  // Switch language
```

## UI/Screen Hierarchy

```
MainActivity (Root)
├── SplashView (health check)
├── LoginScreen (if not authenticated)
├── TabView (3 tabs when authenticated)
│   ├── Tab 0: LibraryScreen
│   │   ├── BookCardList
│   │   └── Loading/Error states
│   ├── Tab 1: DiscussionsScreen
│   │   ├── ChannelSelector (dropdown)
│   │   ├── MessageList
│   │   └── MessageComposer
│   └── Tab 2: ProfileScreen
│       ├── UserInfo card
│       ├── LanguageToggle (En/Fr buttons)
│       └── SignOutButton
└── PlayerScreen (modal overlay when book selected)
    ├── PlayerControls (play/pause, skip)
    ├── ProgressBar (seekable)
    ├── ChapterSelector (dropdown)
    ├── PlaybackRateControl
    └── NowPlayingInfo
```

## Gradle Dependencies

Key libraries (in `app/build.gradle.kts`):

- `androidx.compose.*` — UI framework
- `androidx.lifecycle.*` — ViewModel, coroutines
- `androidx.media3:media3-exoplayer` — Audio playback
- `com.squareup.okhttp3:okhttp` — HTTP client
- `kotlinx.serialization` — JSON parsing

## Development Workflow

1. **Setup emulator**: API 24+ with Google Play Services
2. **Edit gateway**: Update `gatewayBaseUrl` in `MainActivity.kt`
3. **Gradle sync**: `./gradlew build` or sync in Android Studio
4. **Run app**: `./gradlew installDebug` or click Run in Android Studio
5. **Test flow**:
   - Open app → health check → login screen
   - Login → redirected to Library tab
   - Switch tabs → Discussions, Profile
   - Select book → Player opens
   - Profile tab → toggle language → library reloads

## Error Handling

User-friendly error messages for:

- **Unreachable API**: "API is unreachable. Check your connection and try again."
- **Invalid login**: "Invalid email or password."
- **Session expired**: Auto-refresh, then force re-login if fails
- **Network errors**: "Could not load {feature}. Try again."

## Known Limitations & TODOs

- [ ] Download/offline playback (cache chapters locally)
- [ ] Full-text search in Library
- [ ] Collection browsing
- [ ] User statistics/listening history
- [ ] Settings fragment (playback prefs, jump increments)
- [ ] Sleep timer for Player
- [ ] WebSocket message streaming (currently polling)
- [ ] Avatar/profile pictures

## Build & Release

### Debug APK

```bash
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk
```

### Release APK (signed)

1. Generate keystore (first time only)
2. Update `local.properties`:
   ```
   STORE_FILE=/path/to/keystore
   STORE_PASSWORD=***
   KEY_ALIAS=***
   KEY_PASSWORD=***
   ```
3. Build:
   ```bash
   ./gradlew assembleRelease
   ```

## Testing

**Unit tests** (`core-*/src/test`):

```bash
./gradlew test
```

**Integration tests** (`core-*/src/androidTest`):

```bash
./gradlew connectedAndroidTest
```

## Platform Specifics

### Android 12+

- Requires foreground service permission for playback continuation
- Audio focus management built into ExoPlayer

### Android 10-11

- Scoped storage (no write access to shared directories)
- Background execution limited

### Minimum

- **API level**: 24 (Android 7.0)
- **Target**: 34 (Android 14)

## Rules & Best Practices

- **No direct API calls in Views** — always route through repositories
- **Coroutines**: Use `viewModelScope` for all async work
- **Error handling**: Catch exceptions, display to user, never crash
- **Localization**: Use `LocalizationService.translate()` for all strings
- **State management**: Use `StateFlow` in ViewModels, read with `.collectAsState()` in Compose
- **Lifecycle**: Clean up subscriptions in `onCleared()` of ViewModels
- **Performance**: LazyColumns for lists, avoid unnecessary recompositions

## Troubleshooting

**Cant connect to localhost API on emulator?**

- Use `10.0.2.2` instead of `127.0.0.1` or `localhost`
- Check firewall allows port 8100/8443

**App crashes on language change?**

- Ensure `LocalizationService` is passed to all ViewModels needing it
- Check ViewModel is properly handling locale changes

**ExoPlayer won't play audio?**

- Verify stream URL is reachable with `curl`
- Check media session is initialized in `OnCreate`
- Review logs for `ExoPlayer` tag
