# iOS Migration Checklist

## Release Metadata

- Owner:
- Target version:
- Build configuration:
- Date:

## 1. Core App Parity

- [ ] Auth flows implemented (login/register/refresh/logout).
- [ ] Library, collections, series, discussions, profile/settings implemented.
- [ ] Playback and chapter behavior aligned with web baseline.
- [ ] Locale support for `en` and `fr` implemented.

## 2. iOS Architecture

- [ ] SwiftUI screens separated from networking/services.
- [ ] Async auth refresh flow with request replay guard implemented.
- [ ] Shared domain layer for catalog/playback/discussions created.

## 3. iOS Media Integration

- [ ] AVPlayer integration with streaming endpoints complete.
- [ ] Audio interruption and route-change handling implemented.
- [ ] Lock-screen metadata and remote commands configured.
- [ ] Playback resume/progress sync tested across app relaunch.

## 4. Security and Storage

- [ ] Tokens stored in Keychain.
- [ ] Sensitive logs redacted.
- [ ] Session teardown clears memory and persisted auth state.

## 5. Design Token Portability

- [ ] Semantic token set mapped to iOS color assets.
- [ ] Text/background contrast validated in all major screens.
- [ ] Accent/danger/success states consistent with baseline semantics.

## 6. Admin Strategy

- [ ] Admin users see `Open Admin Console` action.
- [ ] Action opens `https://audiobook.aedev.pro/admin/overview/` via SFSafariViewController or browser.
- [ ] No credential handoff through query string.

## 7. Validation

- [ ] Tests cover refresh-on-401 behavior.
- [ ] Playback interruption tests pass.
- [ ] Realtime event handling and reconnection tests pass.
