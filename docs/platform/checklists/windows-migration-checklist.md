# Windows Migration Checklist

## Release Metadata

- Owner:
- Target version:
- Build channel:
- Date:

## 1. Core App Parity

- [ ] Auth and session lifecycle implemented.
- [ ] Library/catalog/discussions/profile/settings implemented.
- [ ] Playback and progress behavior aligned with web baseline.
- [ ] Locale support for `en` and `fr` implemented.

## 2. Windows Architecture

- [ ] Chosen stack documented (MAUI or WinUI).
- [ ] API/auth domain layers isolated from UI layer.
- [ ] Realtime websocket layer with reconnect policy implemented.

## 3. Media and OS Integration

- [ ] Media key handling validated.
- [ ] Playback service behavior validated during suspend/resume.
- [ ] Window resizing and DPI scaling behavior validated.

## 4. Security and Storage

- [ ] Credentials stored via Credential Locker or DPAPI-protected mechanism.
- [ ] No token leakage in logs or diagnostics.
- [ ] Session-clear path validated on refresh failure.

## 5. Design Token Portability

- [ ] Semantic tokens mapped to resource dictionary/theme system.
- [ ] Typography and spacing hierarchy mapped consistently.
- [ ] Error/success/info and disabled states verified.

## 6. Admin Strategy

- [ ] Admin users can open web admin console.
- [ ] Link target: `https://audiobook.aedev.pro/admin/overview/`.
- [ ] Browser launch behavior tested with default browser settings.

## 7. Validation

- [ ] Automated smoke tests pass.
- [ ] Network-loss and token-expiry tests pass.
- [ ] Installer, update, and rollback behavior validated.
