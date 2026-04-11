# Apple Client Workspace

Swift core + SwiftUI multiplatform app structure for iOS and macOS.

## Structure

- `Packages/AudiobookCore`: shared Swift package (network/auth/repositories/domain)
  - `CoreNetworking/`: HTTP client with auth token management
  - `CoreAuth/`: authentication, session persistence, profile fetching
  - `Localization/`: language detection, i18n, translation service
  - `Repositories/`: API data layer (Library, Discussions, Player, etc.)
  - `DTO/`: data models for API responses
- `AudiobookAppleApp`: SwiftUI app targets and platform adapters
  - `Features/`: Auth, Library, Player, Discussions, Profile modules
  - `PlatformAdapters/`: iOS/macOS-specific behaviors

## Architecture

- **MVVM Pattern**: Views → ViewModels → Repositories → APIClient
- **No direct API calls from Views** — all networking via repositories
- **State management**: SwiftUI `@Published` properties, `@State` for UI
- **Error handling**: User-facing messages for all failures
- **Session persistence**: `UserDefaults` + `KeyChain` (optional for sensitive data)

## Implemented Features

### 🔐 Authentication

- **Login**: Email/password → JWT tokens + refresh mechanism
- **Session management**: Auto-refresh on 401 responses
- **Sign-out**: Clear tokens, reset all UI state
- **Profile fetching**: `GET /api/v1/auth/me` for user details
- **Health gate on startup**: Checks `/api/v1/health` before auth flow

### 📚 Library

- **Book listing**: Fetches from `/api/v1/books?language={locale}`
- **Language filtering**: Content respects user's language preference
- **Book metadata**: Title, author, cover art, description
- **Selection**: Tap book → opens Player with streaming setup

### ▶️ Player

- **Audio streaming**: From `/streaming/books/{id}` endpoint
- **Playback controls**: Play, pause, seek, skip back/forward
- **Progress tracking**: Sync to server via WebSocket for multi-device resume
- **Chapter navigation**: Load chapters from metadata, jump to chapter
- **Playback rate**: Adjustable speed (0.5x to 2.0x)
- **Now Playing integration**: System media controls and lock screen metadata
- **Cover art display**: Book cover or fallback gradient

### 💬 Discussions (Chat)

- **Channel listing**: Load language-specific channels from `/api/v1/discussions/channels?language={locale}`
- **Message history**: Fetch messages per channel from `/api/v1/discussions/{channelId}/messages?language={locale}`
- **Message composition**: Type and send text messages
- **Timestamp display**: Shows when messages were posted
- **Sender attribution**: Display username/avatar for each message

### 👤 Profile

- **User info display**: Email, display name, role, join date
- **Language toggle**: English / Français with one-tap switching
- **Automatic refresh**: Reload library/discussions when language changes
- **Sign-out button**: Clear session and return to login

### 🌍 Localization & i18n

- **Device language detection**: Falls back to saved preference or English
- **Persistent locale**: Stored locally via `UserDefaults`
- **Translation service**: `LocalizationService` provides key-based strings
- **Language-aware content**: All API queries include `?language={locale}` parameter
- **Fallback translations**: Built-in English/French strings (no external JSON required)

### 🔄 Real-time Features (WebSocket Ready)

- Player progress synced across devices
- Live message updates in Discussions (when fully wired)
- User presence indicators (when fully wired)

## Gateway Configuration

Edit `AudiobookAppleApp/App/AudiobookApp.swift` to switch between:

```swift
let baseURL = URL(string: "https://audiobook.aedev.pro")  // Production
let baseURL = URL(string: "http://localhost:8100")        // Local development
```

## APIClient & Networking

Located in `Packages/AudiobookCore/Sources/CoreNetworking/APIClient.swift`:

- `getJSON<Response>()` — GET requests with optional query params
- `postJSON<Response, Body>()` — POST with request body
- `putJSON<Response, Body>()` — PUT updates
- `patchJSON<Response, Body>()` — PATCH updates
- `delete()` — DELETE requests

All methods support custom headers for auth tokens.

### Query Parameters Example

```swift
// Fetch English books
let books: [LibraryBookDTO] = try await authService.authenticatedGet(
    path: "api/v1/books",
    queryParams: ["language": "en"]
)
```

## Repositories & Data Layer

### LibraryRepository

```swift
func listBooks(language: String = "en") -> [LibraryBookDTO]
```

### DiscussionRepository

```swift
func listChannels(language: String = "en") -> [DiscussionChannelDTO]
func listMessages(channelId: String, language: String = "en") -> [DiscussionMessageDTO]
func postMessage(channelId: String, text: String) -> DiscussionMessageDTO
```

### PlayerRepository

```swift
func getBook(id: String) -> BookDetailDTO
func getStreamPath(bookId: String) -> String
func saveProgress(bookId: String, position: Double) -> Void
```

### AuthService

```swift
func login(email: String, password: String) -> Void
func refreshSession() -> Void
func signOut() -> Void
func fetchProfile() -> UserProfileDTO
```

## Localization Service

```swift
// Get current locale
let locale = LocalizationService.shared.locale  // "en" or "fr"

// Change language
try await LocalizationService.shared.setLocale("fr")

// Translate a key
let label = LocalizationService.shared.translate("nav.library", fallback: "Library")
```

## UI/View Hierarchy

```
AudiobookApp (Root with TabView)
├── LoginView (if not authenticated)
└── TabView (3 tabs)
    ├── LibraryView
    │   └── BookListView
    ├── DiscussionView
    │   ├── ChannelSelector
    │   ├── MessageList
    │   └── MessageComposer
    └── ProfileView
        ├── UserInfo
        ├── LanguageToggle
        └── SignOutButton

PlayerView (Modal overlay when book selected)
├── PlayerControls
├── ProgressBar
├── ChapterList
└── NowPlayingInfo
```

## Environment & Configuration

### Required Info.plist Entries

- `NSLocalNetworkUsageDescription` — for localhost development
- `NSBonjourServices` — for mDNS if needed

### Supported iOS/macOS

- **iOS**: 14.0+
- **macOS**: 11.0+
- **Swift**: 5.9+
- **Xcode**: 15.0+

## Development Workflow

1. **Set gateway URL** in `AudiobookApp.swift` to your backend
2. **Create targets** for iOS and macOS
3. **Attach package** `Packages/AudiobookCore` to both
4. **Run app** — health gate checks connectivity first
5. **Build & test** each feature in TabView

## Error States

All network errors show user-friendly messages:

- **API unreachable**: "API is unreachable. Check your connection and try again."
- **Auth failed**: "Invalid email or password."
- **Library load failed**: "Could not load your library."
- **Discussions failed**: "Could not load discussions."

## Next Steps

- [ ] WebSocket integration for real-time player sync
- [ ] WebSocket integration for live message streaming in Discussions
- [ ] Download/offline playback support
- [ ] Search and filtering in Library
- [ ] Collection browsing
- [ ] User history and stats
- [ ] Settings page (playback prefs, jump increments)
- [ ] Sleep timer functionality

## Rules

- **MVVM**: Always separate UI from logic
- **No direct API calls**: Use repositories exclusively
- **Async/await**: Prefer over Combine for new code
- **Localization**: Use `LocalizationService.shared.translate()` for all user-facing strings
- **Error handling**: Catch and display errors in views, never crash silently
