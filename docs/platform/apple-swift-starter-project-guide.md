# Apple Native Starter Project Guide (Swift Core + SwiftUI)

Purpose:

- Provide a complete starter blueprint for Apple native clients (iOS and macOS).
- Cover iOS and macOS in one SwiftUI Multiplatform project.
- Enforce MVVM and strict core/UI separation.
- MVP scope: 4 core features (Library, Player, Discussions, Profile) with language detection and i18n.

Scope:

- Included: project structure, module design, dependencies, coding patterns, testing, CI, rollout plan.
- Excluded: endpoint payload internals (see docs/api).

MVP Features Implemented:

- **Authentication**: Login/session/logout with health gate on startup
- **Library**: Browse language-filtered books, select to play
- **Player**: Stream, pause, seek, skip, chapters, playback rate, progress tracking
- **Discussions**: Browse language-scoped channels, view/send messages
- **Profile**: User info, language toggle, sign-out
- **Localization**: Device language detection, LocalizationService, language-aware API queries

Related docs:

- [Native Platform Implementation Guide](./native-platform-implementation-guide.md)
- [Mobile Native MVVM Guide](./mobile-native-mvvm-guide.md)
- [Frontend Client Integration Guideline](./frontend-client-integration-guideline.md)
- [Frontend Client Certification Checklist](./frontend-client-certification-checklist.md)

## 1. Actual Repository Layout

```text
clients/
  apple/
    README.md                          # Client-specific documentation
    AudiobookAppleApp.xcodeproj/
    AudiobookAppleApp/
      App/
        AudiobookApp.swift             # Root app with TabView (4 tabs)
        Branding.swift                 # Design tokens and colors
      Features/
        Auth/
          Views/LoginView.swift
          ViewModels/AuthViewModel.swift
          Models/AuthDTO.swift
        Library/
          Views/LibraryView.swift
          ViewModels/LibraryViewModel.swift
          Models/LibraryViewState.swift
        Player/
          Views/PlayerView.swift
          ViewModels/PlayerViewModel.swift
          Models/PlayerViewState.swift
        Discussions/
          Views/DiscussionView.swift
          ViewModels/DiscussionViewModel.swift
        Profile/
          Views/ProfileView.swift
          ViewModels/ProfileViewModel.swift
      Resources/
        Assets.xcassets
    Packages/
      AudiobookCore/
        Package.swift
        Sources/
          CoreNetworking/
            APIClient.swift            # HTTP client with query param support
          CoreAuth/
            AuthService.swift          # Login, refresh, sign-out, profile fetch
            AuthSessionManager.swift   # Token storage in UserDefaults
          Localization/
            LocalizationService.swift  # Device lang detection, i18n, translation
          Repositories/
            LibraryRepository.swift    # Books with language parameter
            DiscussionRepository.swift # Channels/messages with language param
            PlayerRepository.swift     # Streaming, progress, chapters
          DTO/
            AuthDTO.swift
            LibraryDTO.swift
            DiscussionDTO.swift
            etc.
          CoreRealtime/
            RealtimeClient.swift       # WebSocket ready
        Tests/
```

## 2. Target Setup

Targets:

1. iOS app target (iOS 14.0+)
2. macOS app target (macOS 11.0+)
3. Shared Swift package target (AudiobookCore)

Build configurations:

- Debug-Dev
- Release-Staging
- Release-Prod

Bundle IDs:

- com.audiobook.apple.ios
- com.audiobook.apple.macos

Capabilities:

- iOS: Background Audio, Keychain Sharing
- macOS: App Sandbox, Keychain, Network Client

## 3. Dependency Baseline

Use Swift Package Manager only.

Runtime dependencies (recommended):

- URLSession (native, no Alamofire needed)
- AVFoundation (for playback, platform-specific)
- AVKit (for media controls, iOS/macOS)
- Swift Collections (optional)
- OSLog for structured logging

Testing dependencies:

- XCTest
- Snapshot testing library (optional but recommended)

Rules:

- No dependency that forces Objective-C runtime hacks.
- Keep third-party dependency count low.
- Use native URLSession over third-party HTTP libs.

## 4. Core Library Contracts (AudiobookCore Package)

### CoreNetworking

```swift
class APIClient {
    func getJSON<Response: Decodable>(
        path: String,
        queryParams: [String: String] = [:],
        headers: [String: String] = [:]
    ) async throws -> Response

    func postJSON<Response: Decodable, Body: Encodable>(
        path: String,
        body: Body,
        headers: [String: String] = [:]
    ) async throws -> Response

    // PUT, PATCH, DELETE methods also available
}
```

**Features:**

- Query parameter encoding for language filtering
- Auth header injection (via AuthService wrapper)
- Automatic 401 refresh retry (once)
- Error response parsing

### CoreAuth

```swift
class AuthService {
    func login(email: String, password: String) async throws
    func refreshSession() async throws
    func signOut()
    func fetchProfile() async throws -> UserProfileDTO
    func authenticatedGet<Response>(path: String, queryParams: [String: String]) async throws -> Response
}

class AuthSessionManager {
    var accessToken: String?
    var refreshToken: String?
    var userId: String?
}
```

**Features:**

- Token lifecycle management (access + refresh tokens)
- Automatic refresh on 401
- Session reset on logout
- UserDefaults persistence

### Localization (NEW CoreModule)

```swift
class LocalizationService {
    static let shared: LocalizationService

    var locale: String { get set }  // "en" or "fr"

    func setLocale(_ locale: String) async throws
    func translate(_ key: String, fallback: String?) -> String
}
```

**Features:**

- Auto-detect device language on startup
- Fallback: saved preference → device language → "en"
- Built-in translation dictionaries (no external JSON needed)
- Signals language changes to ViewModels for refresh

### Repositories

**LibraryRepository:**

```swift
func listBooks(language: String = "en") async throws -> [LibraryBookDTO]
```

**DiscussionRepository:**

```swift
func listChannels(language: String = "en") async throws -> [DiscussionChannelDTO]
func listMessages(channelId: String, language: String = "en") async throws -> [DiscussionMessageDTO]
func postMessage(channelId: String, text: String) async throws -> DiscussionMessageDTO
```

**PlayerRepository:**

```swift
func getBook(id: String) async throws -> BookDetailDTO
func getStreamPath(bookId: String) -> String
func saveProgress(bookId: String, position: Double) async throws
```

### CoreRealtime

```swift
class RealtimeClient {
    func connect(token: String)
    func disconnect()
    func onMessage(_ handler: @escaping (RealtimeEvent) -> Void)
}
```

Envelope shape:

```swift
struct RealtimeEvent: Decodable {
    let type: String          // "system.connected", "discussion.message.created"
    let ts: String            // ISO datetime
    let payload: AnyCodable   // Event-specific data
}
```

## 5. App Startup Flow

1. `AudiobookApp.swift` root view
2. Check `AuthSessionManager.isAuthenticated`
3. If not authenticated: show `LoginView`
4. If authenticated: trigger health gate
   - Call `GET /api/v1/health`
   - If success: show `TabView` (4 tabs)
   - If failure: show `APIHealthGateView` with retry
5. On successful auth: load Library, Discussions, Profile

## 6. Navigation Structure (TabView-based)

```
AudiobookApp (Root Decision)
├── LoginView (not authenticated)
└── TabView (authenticated)
    ├── Tab 1: LibraryView
    │   └── Shows list of books
    │   └── Select book → PlayerView (modal)
    │
    ├── Tab 2: DiscussionView
    │   ├── ChannelSelector (dropdown or buttons)
    │   ├── MessageList (scrollable)
    │   └── MessageComposer (input field)
    │
    └── Tab 3: ProfileView
        ├── User info card
        ├── Language toggle (En/Fr buttons)
        └── Sign out button

PlayerView (Modal overlay)
├── Appears when book selected from Library
├── Shows playback controls, progress, chapters
└── Back button returns to Library tab
```

## 7. MVVM Template (Mandatory)

ViewModel contract:

```swift
@MainActor
class BookListViewModel: ObservableObject {
    @Published private(set) var state: BookListState

    func loadBooks() async
    func selectBook(_ id: String)
}
    var books: [BookItem] = []
    var query: String = ""
    var error: LocalizedErrorState?
}

@MainActor
final class LibraryViewModel: ObservableObject {
    @Published private(set) var state = LibraryState()

    func onAppear() async { }
    func onSearchChanged(_ value: String) async { }
    func onRetryTapped() async { }
}
```

Rules:

- Views are render-only and dispatch intents.
- ViewModel owns state transitions.
- Repository handles API calls and mapping.

## 6. Frontend UX Baseline (Apple)

Required tabs:

1. Library
2. Activity/History
3. Discussions
4. Profile

Library:

- search at top
- filter chips below search
- card list/grid with cover/title/author/progress

Player:

- prominent cover art
- transport controls centered
- chapter sheet
- elapsed/remaining timeline

Discussions:

- language channel selector (en/fr)
- paged message list
- pinned composer input

Profile:

- account section
- locale switch
- playback preferences
- admin link-out for admin role

## 7. Platform Adapter Requirements

iOS adapters:

- AVAudioSession interruption handling
- MPRemoteCommandCenter mapping
- Now Playing metadata updates

macOS adapters:

- window state restoration
- command menu shortcuts
- keyboard transport controls

Shared behavior required:

- same API contract
- same progress semantics
- same locale behavior

## 8. Security and Storage

Required:

- tokens stored in Keychain only
- no auth tokens in UserDefaults
- redact headers/tokens from logs
- full auth state reset on refresh failure

Refresh behavior:

- one retry on protected request after refresh
- if refresh fails: sign out + clear state + route to auth

## 9. Localization

Required locales:

- en
- fr

Files:

- Localizable.strings (or .stringsdict where needed)

Rules:

- no hardcoded UI strings
- locale switch triggers content refresh for language-sensitive screens

## 10. Testing Strategy

Unit tests:

- ViewModel state transitions
- repository error mapping
- refresh flow coordinator
- websocket event router

Integration tests:

- auth + refresh + forced logout
- library load + filters + locale changes
- player resume + progress save
- discussions send/receive

UI tests:

- tab navigation
- basic playback controls
- locale switch
- error and retry states

## 11. CI/CD Baseline

Pipeline stages:

1. lint + format check
2. unit tests
3. integration tests
4. build iOS and macOS targets
5. artifact signing checks

Release gates:

- checklist pass from frontend-client-certification-checklist
- no token leakage in logs
- all required locales valid

## 12. Initial Implementation Sequence

Sprint 1:

- project bootstrap, core networking/auth/storage
- auth feature MVVM

Sprint 2:

- library + series + collections
- basic caching

Sprint 3:

- player + progress sync + adapters

Sprint 4:

- discussions + realtime
- profile/settings + admin link-out

Sprint 5:

- accessibility/performance pass
- certification + release prep

## 13. Definition of Done

Done when:

- MVVM boundaries are fully respected
- iOS and macOS run from one codebase with adapters
- parity features shipped and verified
- all certification checklist items pass for Apple targets

## 14. Technical Links

API references:

- ../api/auth-endpoints.md
- ../api/books-endpoints.md
- ../api/collections-endpoints.md
- ../api/discussions-endpoints.md
- ../api/progress-endpoints.md
- ../api/series-endpoints.md
- ../api/settings-endpoints.md
- ../api/stats-endpoints.md
- ../api/streaming-endpoints.md
