# Frontend Client Certification Checklist

Use this checklist to certify a client implementation for release readiness across web, mobile, and desktop platforms.

Related reference:

- docs/platform/frontend-client-integration-guideline.md
- docs/platform/mobile-native-mvvm-guide.md
- docs/platform/windows-electron-implementation-guide.md

## Release Metadata

- Client name:
- Platform:
- Version:
- Build number:
- Release date:
- Owner:
- QA lead:

## 1. API and Contract Compliance

- [ ] API base paths are correct: /api/v1, /streaming, /ws.
- [ ] All protected HTTP requests send Authorization: Bearer <accessToken>.
- [ ] Error handling supports 401, 403, 404, 429, and 5xx with expected UX behavior.
- [ ] No endpoint path hardcoded to an environment-specific hostname in production build.
- [ ] Response parsing tolerates additive fields without failures.

## 2. Authentication and Session Security

**All clients:**

- [ ] Startup health gate: GET /api/v1/health completes before attempting auth/features. On failure, show offline message with retry.
- [ ] Login flow works: email and password.
- [ ] Token refresh flow is implemented and retries only once per failed protected request.
- [ ] Refresh failure forces clean logout and session reset.
- [ ] Logout revokes session server-side and clears local auth state.
- [ ] Tokens are stored in platform-appropriate secure storage (Keychain/UserDefaults on iOS, Keystore/SharedPreferences on Android, browser secure storage on web).
- [ ] No secrets, tokens, or idToken values are logged.

**Mobile clients specific:**

- [ ] OAuth flow works for configured providers (Apple Sign-In for iOS, Google Sign-In for Android) where supported.
- [ ] Local session recovery after app restart works.

## 3. Localization and Language Behavior

**Web clients:**

- [ ] Locale files load successfully from /i18n/en.json and /i18n/fr.json.
- [ ] Default locale selection works at first launch.
- [ ] Locale preference persists locally across browser sessions.
- [ ] Locale syncs to user profile or settings when authenticated.
- [ ] No untranslated keys are rendered in UI.
- [ ] No hardcoded user-facing strings remain outside localization catalogs.

**Mobile clients (Apple/Android):**

- [ ] LocalizationService detects system language on first launch.
- [ ] Fallback to saved preference, then default to English.
- [ ] Locale is persisted in UserDefaults (iOS) or SharedPreferences (Android).
- [ ] Language toggle in Profile screen works and persists choice.
- [ ] All API queries for books, discussions include `?language=en|fr` parameter.
- [ ] Locale switching refreshes content in Library and Discussions tabs.
- [ ] No untranslated keys are rendered in UI.

## 4. Core Experience – Feature Matrix

### Scope Definition

**Web client:**

- Full feature set (all items below apply)
- Includes admin console

**Mobile clients (4-feature MVP):**

- Library (browse language-filtered books)
- Player (audio streaming, resume, progress, chapters)
- Discussions (language-scoped channels, messages)
- Profile (user info, language toggle, sign-out)
- **Excluded**: Series, Collections, Activity/History, Admin

### Web Client Feature Gates

- [ ] Library listing works with search and filters.
- [ ] Series listing and series detail views work.
- [ ] Collections list and collection detail workflows work.
- [ ] Discussions channel views and message sending work.
- [ ] Playback resume endpoint is used before playback start.
- [ ] Audio streaming endpoint supports range playback correctly.
- [ ] Progress save and completion status behavior is correct.
- [ ] Role-based navigation behavior is correct for user and admin roles.

### Mobile Client Feature Gates (4-Feature MVP)

- [ ] Library browsing works (list view, no search filter for MVP).
- [ ] Book selection opens Player for streaming.
- [ ] Audio streaming endpoint supports range playback correctly.
- [ ] Playback resume endpoint is used before playback start.
- [ ] Progress save and completion tracking works.
- [ ] Discussions channel list and message send/receive works.
- [ ] Profile screen displays user info and language toggle.
- [ ] Admin link-out button redirects to web console without authentication error.

## 4.1 Mobile MVVM Architecture Gate

**Applies to iOS, Android, and future macOS/Windows mobile clients.**

- [ ] Every feature uses MVVM (View, ViewModel, Repository boundaries are respected).
- [ ] Views do not call network services directly.
- [ ] ViewModels expose explicit loading, empty, error, and success states.
- [ ] Repository/domain layer is independent from UI framework types.
- [ ] One-shot UI events (navigation/toast/dialog) are handled as events, not persistent state.
- [ ] LocalizationService is injected at app root and passed to ViewModels for language-aware queries.

## 5. Realtime Behavior

**Web clients:**

- [ ] Client connects to /ws using ws or wss based on environment.
- [ ] WebSocket reconnect behavior is implemented.
- [ ] system.connected event is handled.
- [ ] catalog.book.added event is handled.
- [ ] discussion.message.created event is handled.
- [ ] Event handling avoids duplicate visual updates.
- [ ] Connection loss produces user-appropriate fallback behavior.

**Mobile clients (MVP scope):**

- [ ] Client connects to /ws using ws or wss based on environment.
- [ ] WebSocket reconnect behavior is implemented (2s start, 30s max, ±20% jitter).
- [ ] system.connected event is handled.
- [ ] discussion.message.created event is handled (for Discussions tab).
- [ ] Event handling avoids duplicate message display.
- [ ] Connection loss shows offline indicator in Discussions tab.

## 6. UX and Design Consistency

**All clients:**

- [ ] Navigation structure matches platform contract.
- [ ] Locale toggle is discoverable and functional.
- [ ] Loading, empty, and error states are present for networked screens.
- [ ] Destructive actions require explicit confirmation.
- [ ] Accessibility contrast meets WCAG AA.
- [ ] Keyboard and screen reader behavior is acceptable for platform norms.

**Web client specific:**

- [ ] Full navigation structure (Library, Series, Collections, Discussions, Profile, Admin).
- [ ] Typography, spacing, color, and radius follow shared design tokens.

**Mobile clients specific (MVP):**

- [ ] TabView with 4 tabs: Library | Discussions | Profile (+ modalPlayer).
- [ ] Each tab has proper back/dismiss navigation.
- [ ] Player appears as full-screen or modal overlay on Library selection.
- [ ] Language toggle buttons ("En", "Fr") are in Profile tab.

## 7. Performance and Reliability

- [ ] App launch or first interactive experience meets target performance.
- [ ] Library first render meets target performance for warm API path.
- [ ] No memory leak observed in long session test.
- [ ] Cover and list caching strategy is implemented.
- [ ] Request timeouts are defined.
- [ ] Retry policy applies only to idempotent reads.

## 8. Logging, Diagnostics, and Privacy

- [ ] Request logging captures method, path, status, and duration without secrets.
- [ ] Auth refresh attempts are logged without exposing tokens.
- [ ] WebSocket connect, disconnect, and error lifecycle is observable.
- [ ] Locale load and switch diagnostics are observable.
- [ ] PII and credential data are redacted in client diagnostics.

## 9. Test Coverage Gate

**All clients:**

- [ ] Auth tests pass (login, logout, refresh).
- [ ] Refresh and forced logout tests pass.
- [ ] Locale switch and dictionary coverage tests pass.
- [ ] Error state transitions tested (loading, empty, error, success).

**Web client:**

- [ ] Full feature workflow tests pass (all UI paths, admin console).
- [ ] Regression smoke tests pass on supported browsers.

**Mobile clients (4-Feature MVP):**

- [ ] Health gate and startup flow tests pass.
- [ ] Library browse and select tests pass.
- [ ] Player resume and progress tracking tests pass.
- [ ] Discussions channel and message tests pass.
- [ ] Profile language toggle tests pass.
- [ ] Realtime event handling tests pass.
- [ ] Offline behavior tests pass (network unavailable scenarios).
- [ ] ExoPlayer/AVPlayer integration tests pass.
- [ ] Regression smoke tests pass on emulator/actual device.

## 10. Platform-Specific Signoff

### Web (Full Feature Set)

- [ ] Reverse-proxy deployment works for /api/v1, /streaming, /ws, and /i18n.
- [ ] Browser compatibility matrix validated.
- [ ] All features (Library, Series, Collections, Discussions, Profile, Admin) tested.

### iOS (4-Feature MVP)

- [ ] Startup health gate tested (/api/v1/health).
- [ ] Auth flow (login/logout) works with secure Keychain storage.
- [ ] LocalizationService detects system language and persists choice.
- [ ] Language toggle in Profile switches content language (en/fr).
- [ ] Library tab displays books and selection opens Player.
- [ ] Player (AVPlayer) resumes from saved progress.
- [ ] Discussions tab shows language-scoped channels and message send/receive.
- [ ] Profile shows user info, language toggle, and admin link-out.
- [ ] Background audio continuation works (pauses on lock, resumes on unlock).
- [ ] Audio interruption handling (headphone unplug shows pause).
- [ ] Lock-screen controls functional.
- [ ] TabView navigation between Library, Discussions, Profile works smoothly.
- [ ] Memory profile acceptable under long playback session.

### Android (4-Feature MVP)

- [ ] Startup health gate tested (/api/v1/health).
- [ ] Auth flow (login/logout) works with secure SharedPreferences storage.
- [ ] LocalizationService detects system language and persists choice.
- [ ] Language toggle in Profile switches content language (en/fr).
- [ ] Library tab displays books and selection opens Player.
- [ ] ExoPlayer (Media3) integration tested (play, pause, seek, skip, chapters).
- [ ] Progress persistence and resume from saved position works.
- [ ] Discussions tab shows language-scoped channels and message send/receive.
- [ ] Profile shows user info, language toggle, and admin link-out.
- [ ] Background playback notification and lock-screen controls work.
- [ ] Audio focus handling (other app audio doesn't override).
- [ ] MediaSession integration for system controls.
- [ ] TabView navigation between Library, Discussions, Profile works smoothly.
- [ ] Memory profile acceptable under long playback session.

### macOS (Future Phase)

- [ ] Planned future platform (not in MVP scope).
- [ ] Will use iOS Swift code with macOS-specific UI adapters.

### Windows Desktop (Future Phase)

- [ ] Planned future platform (not in MVP scope).
- [ ] Windows Electron implementation will support full feature set including admin.
- [ ] Secure storage (Windows Credential Manager) will be implemented.
- [ ] Media controls integration validated.
- [ ] Electron security baseline validated (context isolation, disabled node integration in renderer, constrained IPC).

## 11. Final Approval

- [ ] Security review approved.
- [ ] QA signoff approved.
- [ ] Product signoff approved.
- [ ] Observability dashboards and logs verified for release.
- [ ] Rollback plan documented.

Decision:

- [ ] Approved for release
- [ ] Blocked

Blocking issues:

-
-

Approver names and timestamps:

-
