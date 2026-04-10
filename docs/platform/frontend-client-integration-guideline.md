# Frontend Client Integration Guideline

This document defines the implementation contract for all client applications that integrate with the Audiobook Platform API.

Supported client targets:
- Web browser
- Android mobile
- iOS mobile
- macOS desktop
- Windows desktop
- Linux desktop

Related references:
- [Web Frontend Technical Reference](./web-frontend-technical-reference.md)
- [Native Platform Implementation Guide](./native-platform-implementation-guide.md)

Primary goals:
- Consistent appearance and interaction behavior across platforms
- Consistent API usage and security posture
- Predictable realtime and playback behavior
- Shared feature parity and release quality standards

Baseline policy:
- The current web frontend is the minimum functionality reference implementation.
- Other platforms should match this baseline for core listening/user functionality.

## 1. Product Scope and Capability Map

All clients should support the same user-facing capability set, unless a feature is explicitly marked as optional.

Required capabilities:
- Authentication
  - Email and password login
  - Email and password registration
  - OAuth login with Google and Apple when configured
  - Access and refresh token lifecycle
- Library discovery
  - List books
  - Search and filtering
  - Series browsing
  - Collection browsing and collection details
- Playback
  - Resume playback
  - Stream audio with range support
  - View chapters
  - Save progress and completion
- User settings
  - Locale and language preference
  - Playback preferences and resume rewind
  - Profile updates where supported by API
- Discussions
  - Language scoped channels (en, fr)
  - Message list and send message
  - Realtime message updates
- Realtime updates
  - WebSocket connection to /ws
  - React to book added and other envelope events

Admin capabilities are optional per client.

Default strategy for non-web clients:
- Use a direct link-out to the canonical web admin console:
  - `https://audiobook.aedev.pro/admin/overview/`
- Do not block platform release on native admin parity unless explicitly required.
- If implemented, native admin support can be delivered as a later incremental scope.

Admin upload UX requirement:
- Prepared upload queues should survive admin route navigation within the same app session.
- A full browser reload may require re-selecting files, but per-item metadata choices should remain recoverable where feasible.

## 2. API Integration Contract

### 2.1 Base Paths

Use these routes exactly:
- API base: /api/v1
- Streaming base: /streaming
- Realtime WebSocket: /ws

Do not hardcode hostnames in code when the app can resolve relative paths from current host.

### 2.2 Authentication Endpoints

From /api/v1/auth:
- POST /login
- POST /register
- POST /refresh
- POST /logout
- POST /oauth/google
- POST /oauth/apple
- GET /me
- POST /change-password
- POST /change-email

Token model:
- accessToken is a JWT used in Authorization header
- refreshToken is opaque and used for token rotation
- On refresh success, replace both stored tokens

### 2.3 Core User Endpoints

Required endpoint groups:
- Books: /api/v1/books
- Series: /api/v1/series
- Collections: /api/v1/collections
- Progress: /api/v1/progress
- Settings: /api/v1/settings
- Stats: /api/v1/stats
- Discussions: /api/v1/discussions

Streaming endpoints:
- GET /streaming/books/:bookId/resume
- GET /streaming/books/:bookId/audio
- GET /streaming/books/:bookId/cover

### 2.4 Error Handling Contract

Assume API errors return this shape:

{
  "message": "error_code"
}

Client behavior rules:
- 401 and 403 on protected endpoints:
  - Attempt one token refresh flow if refresh token exists
  - Retry original request once after successful refresh
  - If refresh fails, force logout and navigate to auth flow
- 404:
  - Show platform-native not found state
- 429:
  - Show rate limit message and retry guidance
- 5xx:
  - Show transient failure UI and enable retry action

## 3. Security Requirements

### 3.1 Transport and Secrets

Required:
- TLS only in production
- Never log accessToken or refreshToken
- Never log OAuth idToken
- Redact Authorization headers in diagnostics

### 3.2 Token Storage by Platform

Web:
- Current web client stores tokens in localStorage
- For other web clients, prefer secure cookie strategy if backend topology allows

Mobile and desktop:
- Android: EncryptedSharedPreferences or Keystore-backed secure store
- iOS/macOS: Keychain
- Windows: Credential Locker or DPAPI protected vault
- Linux desktop: Secret Service integration (GNOME Keyring or KWallet)

### 3.3 Session Lifecycle

Required behavior:
- Refresh token rotation on /auth/refresh
- Clear all auth state on refresh failure
- Clear auth state on explicit logout
- Do not keep stale user profile in memory after logout

## 4. Realtime Contract

WebSocket endpoint:
- ws://<host>/ws
- wss://<host>/ws

Envelope shape:
- type: string
- ts: ISO datetime string
- payload: object

Current event types:
- system.connected
- job.state.changed
- catalog.book.added
- discussion.message.created

Realtime client rules:
- Reconnect with backoff after close or error
- Ignore malformed messages
- Keep event handler routing by type
- Avoid duplicate UI updates if same event is replayed

Recommended reconnect policy:
- Start at 2 seconds
- Increase to max 30 seconds
- Add jitter of plus or minus 20 percent

## 5. Localization and Content Language

### 5.1 Locale Assets

Locale dictionaries are served from:
- /i18n/en.json
- /i18n/fr.json

Required behavior:
- Load locale at startup
- Persist locale choice locally
- If authenticated, persist preferred locale to user settings and profile APIs

### 5.2 Language-Aware Content Filtering

Library and series queries should include language when not explicitly provided:
- en locale defaults to language=en
- fr locale defaults to language=fr

On locale switch:
- Refresh library datasets
- Refresh series and collection detail datasets
- Keep route state when possible

### 5.3 Translation Rules

Required:
- No hardcoded user-facing strings in UI components
- All copy must use key-based localization
- Keep key naming stable across clients

Suggested key namespace pattern:
- app.*
- nav.*
- auth.*
- library.*
- series.*
- collections.*
- discussions.*
- player.*
- settings.*
- common.*

## 6. UX Consistency Contract

### 6.1 Navigation Model

Expected top-level destinations:
- Library
- Activity (listened collection)
- Discussions
- Profile
- Admin section for admin users

Behavior standards:
- Keep nav item order consistent
- Keep locale switch discoverable in top navigation region
- Keep route naming and deep links stable across clients

### 6.2 Visual Design Tokens

Define and use a shared token catalog per client platform:
- Colors
- Typography scale
- Spacing scale
- Radius scale
- Elevation and shadows
- Motion timing and easing

Required token behavior:
- No per-screen ad hoc styling
- Use semantic tokens for text, surface, border, accent, and error
- Keep contrast accessible (minimum WCAG AA)

### 6.3 Interaction Patterns

Standard interaction behaviors:
- Loading states for all network calls
- Empty states with clear call to action
- Inline error messages for form and request failures
- Retry affordance for failed requests
- Destructive actions require confirmation

Playback interaction standards:
- Preserve current position frequently
- Use server resume endpoint before playback start
- Show completion badge and state consistently

## 7. Platform Implementation Guidance

### 7.1 Android and iOS

Recommended stack properties:
- Typed API layer with request and response models
- Dedicated auth interceptor with refresh queue lock
- Persistent secure token storage
- Background friendly audio player integration
- Local caching for list pages and cover images

Mobile-specific requirements:
- Audio focus and interruption handling
- Headphone and lock-screen media controls
- Resume playback on app relaunch

### 7.2 Desktop (macOS, Windows, Linux)

Recommended stack properties:
- Shared API core used by all desktop targets where possible
- Native secure credential storage
- Adaptive layouts for wide and narrow windows
- Keyboard navigation parity with web

Desktop-specific requirements:
- Robust window resize behavior
- Global media keys where available
- Local cache directory management with size limits

### 7.3 Web

Recommended stack properties:
- Relative API paths for reverse-proxy deployment
- Reliable reconnect strategy for WebSocket
- Graceful behavior when browser blocks autoplay
- Asset loading from public paths including /i18n

## 8. State Management Model

Required state domains:
- Auth state
- User profile and settings state
- Library and search state
- Playback session state
- Realtime connection state
- Discussion channel and message state

Rules:
- Keep API models separate from view models
- Keep transient UI state local to view layer
- Use immutable updates for predictable rendering

## 9. Performance and Reliability

Minimum targets:
- Time to interactive under 3 seconds on mid-tier devices and stable network
- Initial library render under 2 seconds after auth on warm API path
- Smooth scrolling and interaction at 60 fps where possible

Reliability controls:
- Request timeout strategy
- Retry with exponential backoff for idempotent GET requests
- Do not auto retry non-idempotent POST and PATCH without user intent

Caching guidance:
- Cache covers aggressively with eviction policy
- Cache dictionaries /i18n/*.json with version-aware invalidation
- Cache list responses briefly to improve navigation speed

## 10. Logging and Observability

Client logs should include:
- Request method, path, status, duration
- Token refresh attempts and outcomes (without secrets)
- WebSocket connection lifecycle
- Locale load and switch outcomes

Server-side diagnostics already available:
- WebSocket upgrade and connect logs
- WebSocket disconnect and error logs
- Realtime broadcast debug logs in non-production mode

## 11. Testing and Quality Gates

Required automated checks per client:
- Auth flow tests
- Token refresh and forced logout tests
- Library and filtering tests including language behavior
- Playback resume tests
- Realtime event handling tests
- Locale switch tests and translation key coverage checks

Release gate checklist:
- No untranslated keys rendered in UI
- No hardcoded UI strings outside dictionary files
- No temporary debug toggles left enabled
- No insecure token logging
- API compatibility validated against current endpoint docs

## 12. Compatibility and Versioning

Client compatibility strategy:
- Track API contract changes in docs/api
- Prefer additive changes in responses
- Tolerate unknown fields in responses and events
- Guard optional fields with defaults

For breaking API changes:
- Announce migration notes
- Version-gate features where needed
- Keep old behavior behind compatibility adapters during transition

## 13. Implementation Checklist for New Client Teams

1. Set up API client with /api/v1 and /streaming base routes.
2. Implement auth token lifecycle and secure storage.
3. Implement i18n loading from /i18n/en.json and /i18n/fr.json.
4. Build library, series, collection, and playback flows.
5. Implement progress persistence and completion behavior.
6. Add WebSocket integration for /ws and typed event routing.
7. Implement discussions flow with language channels.
8. Add settings sync for locale and playback preferences.
9. Validate UX and design token parity with reference web behavior.
10. Pass release gate checklist from section 11.

## 14. Related Documentation

- docs/api/auth-endpoints.md
- docs/api/books-endpoints.md
- docs/api/collections-endpoints.md
- docs/api/discussions-endpoints.md
- docs/api/progress-endpoints.md
- docs/api/realtime-events.md
- docs/api/series-endpoints.md
- docs/api/settings-endpoints.md
- docs/api/stats-endpoints.md
- docs/api/streaming-endpoints.md
- docs/platform/api-functionality-coverage.md
- docs/platform/api-worker-integration.md
- docs/platform/architecture-build-specification.md
