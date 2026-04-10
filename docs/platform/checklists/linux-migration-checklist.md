# Linux Migration Checklist

## Release Metadata

- Owner:
- Target version:
- Distribution targets:
- Date:

## 1. Core App Parity

- [ ] Auth, library, playback, discussions, profile/settings implemented.
- [ ] Locale and language filtering behavior align with web baseline.
- [ ] Playback progress sync validated.

## 2. Linux Architecture

- [ ] Chosen stack documented (Flutter/Tauri/Electron/native toolkit).
- [ ] API/auth layers separated from presentation logic.
- [ ] Realtime websocket reconnect behavior implemented.

## 3. Media and Desktop Integration

- [ ] Media key support validated on target desktop environments.
- [ ] Audio output switch and interruption behavior validated.
- [ ] Cache directory and max-size policy implemented.

## 4. Security and Storage

- [ ] Tokens stored through Secret Service (GNOME Keyring/KWallet).
- [ ] Fallback storage behavior documented for unsupported environments.
- [ ] Log redaction for auth and user-sensitive fields validated.

## 5. Design Token Portability

- [ ] Semantic tokens mapped to Linux client theme system.
- [ ] Contrast and typography hierarchy validated.
- [ ] Focus and keyboard navigation states validated.

## 6. Admin Strategy

- [ ] Admin users can open web admin console from app UI.
- [ ] Link target: `https://audiobook.aedev.pro/admin/overview/`.
- [ ] External browser launch behavior validated on target distributions.

## 7. Validation

- [ ] CI smoke tests and packaging tests pass.
- [ ] Runtime dependency checks completed for each distribution.
- [ ] Install/uninstall and upgrade behavior verified.
