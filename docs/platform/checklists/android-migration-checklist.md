# Android Migration Checklist

## Release Metadata

- Owner:
- Target version:
- Build variant:
- Date:

## 1. Core App Parity

- [ ] Auth flows implemented (login/register/refresh/logout).
- [ ] Library, collections, series, discussions, profile/settings implemented.
- [ ] Playback resume and progress save behaviors match web baseline.
- [ ] Locale support for `en` and `fr` implemented.

## 2. Android Architecture

- [ ] App uses Kotlin + Compose module structure or approved equivalent.
- [ ] Network layer includes auth interceptor and refresh queue lock.
- [ ] Domain modules isolate playback/catalog/discussions logic.
- [ ] UI layer avoids embedding API orchestration in composables.

## 3. Android Media Integration

- [ ] ExoPlayer/Media3 configured for streaming endpoints.
- [ ] Audio focus and interruptions handled correctly.
- [ ] Lock-screen and notification controls mapped to playback actions.
- [ ] Progress checkpointing on pause/seek/exit implemented.

## 4. Security and Storage

- [ ] Tokens stored in EncryptedSharedPreferences or Keystore-backed store.
- [ ] No auth tokens logged.
- [ ] Refresh failure clears secure storage and in-memory state.

## 5. Design Token Portability

- [ ] Semantic tokens mapped to Android theme resources.
- [ ] `primary`, `accent`, `surface`, `text`, `danger`, `success` roles preserved.
- [ ] Focus/pressed/disabled visual states validated.

## 6. Admin Strategy

- [ ] Admin users see `Open Admin Console` action.
- [ ] Link opens `https://audiobook.aedev.pro/admin/overview/` in trusted browser.
- [ ] No token material appended to URL.

## 7. Validation

- [ ] Unit tests for auth refresh and playback progress pass.
- [ ] Integration tests for locale switch and websocket events pass.
- [ ] Manual QA pass on low-memory and network-loss scenarios completed.
