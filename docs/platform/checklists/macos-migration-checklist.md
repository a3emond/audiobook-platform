# macOS Migration Checklist

## Release Metadata

- Owner:
- Target version:
- Build configuration:
- Date:

## 1. Core App Parity

- [ ] Auth, library, playback, discussions, profile/settings implemented.
- [ ] Locale behavior aligns with web baseline.
- [ ] Progress synchronization parity validated.

## 2. macOS Architecture

- [ ] SwiftUI/AppKit boundaries documented.
- [ ] Window-resize behavior tested for compact and wide layouts.
- [ ] Keyboard-first navigation implemented for key flows.

## 3. Media and System Integration

- [ ] Playback controls integrated with platform media controls where supported.
- [ ] Resume state survives app restart.
- [ ] Audio session behavior validated during output device switches.

## 4. Security and Storage

- [ ] Tokens stored in Keychain.
- [ ] Sensitive telemetry redaction validated.
- [ ] Sign-out clears all local auth artifacts.

## 5. Design Token Portability

- [ ] Semantic tokens mapped to macOS theme resources.
- [ ] Sidebar/content/action hierarchy preserves baseline visual semantics.
- [ ] Hover/focus/selected states validated for accessibility.

## 6. Admin Strategy

- [ ] Admin users have `Open Admin Console` action in app menu or profile.
- [ ] Action opens `https://audiobook.aedev.pro/admin/overview/` in default browser.

## 7. Validation

- [ ] End-to-end smoke tests pass.
- [ ] Memory/leak checks on long playback sessions completed.
- [ ] Packaging/signing and update path validated.
