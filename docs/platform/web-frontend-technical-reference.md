# Web Frontend Technical Reference

Purpose:
- Define the current Angular web application as the baseline implementation for all other client platforms.
- Document architecture, module responsibilities, technical contracts, and theming transfer rules.

Scope:
- Included: frontend architecture, routing, state model, API/realtime integration, playback behavior, i18n, design tokens, and admin-web redirection strategy.
- Excluded: backend endpoint internals (see API docs), worker internals, infrastructure provisioning details.

Related docs:
- [Frontend Client Integration Guideline](./frontend-client-integration-guideline.md)
- [Native Platform Implementation Guide](./native-platform-implementation-guide.md)
- [Architecture Build Specification](./architecture-build-specification.md)

## 1. Baseline Principle

This web client is the source baseline for minimum functional parity.

Meaning of parity for Android, iOS, macOS, Windows, and Linux:
- Same core user journeys (auth, library, playback, discussions, profile/settings).
- Same API contract and error behavior.
- Same localization behavior and language defaults.
- Same semantic design system (color roles, typography roles, spacing/radius/elevation roles).

## 2. Frontend Runtime and Build

Current stack:
- Angular standalone app in `frontend/src/app`.
- TypeScript + RxJS + Angular signals/effects.
- CSS with global design tokens in `frontend/src/styles.css` and feature-level scoped styles.

Build/runtime model:
- Browser app behind reverse proxy.
- Relative API and streaming routes expected (`/api/v1`, `/streaming`, `/ws`, `/i18n`).
- Production build generated via Angular build pipeline.

## 3. Feature Architecture

Primary domains:
- Auth: login/register/oauth/session handling.
- Library: books, collections, series browsing/search.
- Player: stream, chapter navigation, progress sync, media session support.
- Discussions: channel list, language-scoped messages, realtime updates.
- Profile/Settings: locale and account preferences.
- Admin: web-native admin workflows.

Code organization convention (applied across features):
- `*.page.ts` or component entry file:
  - orchestrates UI state + calls helpers/services.
- `*.types.ts`:
  - local type contracts and view models.
- `*.utils.ts`:
  - deterministic helpers and formatting logic.
- `*.data.ts` (where relevant):
  - data workflow wrappers and fetch/transform flows.

This split is mandatory for new features and refactors to keep page/service files focused and testable.

## 4. Routing and Navigation Contract

Top-level destinations:
- Library
- Activity/History
- Discussions
- Profile
- Admin (role-gated)

Navigation parity rules for all platforms:
- Destination names and ordering should remain recognizable.
- Deep-link semantics should remain stable.
- Locale and user/session actions should stay discoverable.

## 5. Data and State Domains

Required state slices:
- Auth state: tokens, user identity, role, auth lifecycle flags.
- Catalog state: books/collections/series and query filters.
- Playback state: active book, chapter, position, buffered/playing status, sleep timer.
- Discussions state: channel selection, message pages, pending send state.
- Profile/settings state: locale and user preferences.
- Realtime state: websocket connection lifecycle and last event timestamps.

Rules:
- Keep API models and UI view models separated.
- Keep ephemeral UI state local to feature/page.
- Keep side effects in services/data modules, not pure utils.

## 6. API and Realtime Integration

HTTP base routes:
- `/api/v1`
- `/streaming`

Realtime endpoint:
- `/ws`

Client behavior expectations:
- Attach bearer token to protected requests.
- Perform single refresh retry policy on 401/403 flows where applicable.
- Normalize API error rendering for 404/429/5xx.
- Reconnect websocket with capped backoff + jitter.
- Route websocket events by `type` envelope key.

## 7. Playback and Progress Technical Behavior

Playback contract:
- Query resume state before starting playback when possible.
- Use streaming endpoint with range-capable playback.
- Persist progress periodically and at major boundaries (pause/seek/book close).
- Resolve chapter boundaries from normalized chapter metadata.
- Keep media-session metadata/actions aligned with playback state.

Cross-platform parity target:
- Chapter navigation behavior and completion thresholds must match web rules.
- Sleep timer capabilities should be equivalent where platform APIs allow.

## 8. Localization and Language Strategy

Locale assets:
- `/i18n/en.json`
- `/i18n/fr.json`

Expected behavior:
- Load locale at startup.
- Persist local preference.
- Sync locale preference to profile/settings APIs when authenticated.
- Use locale-aware default language filters for catalog/discussions content.

## 9. Design System and Theme Portability

The global token contract is defined in `frontend/src/styles.css`.

Token classes:
- Color roles:
  - `--color-bg`
  - `--color-surface`
  - `--color-surface-soft`
  - `--color-surface-strong`
  - `--color-surface-contrast`
  - `--color-border`
  - `--color-text`
  - `--color-text-muted`
  - `--color-primary`
  - `--color-primary-dark`
  - `--color-accent`
  - `--color-accent-hover`
  - `--color-danger`
  - `--color-success`
  - compatibility aliases: `--color-background`, `--color-on-primary`, `--color-focus-ring`
- Shape and depth:
  - `--radius-sm`, `--radius`, `--radius-lg`
  - `--shadow-sm`, `--shadow`, `--shadow-lg`
- Layout:
  - `--topbar-h`

Portability requirement:
- Native clients must map semantic roles, not raw hex values.
- Platform visuals can be adapted to native idioms, but token semantics must remain stable.

Recommended platform token mapping approach:
1. Define shared semantic token names in a platform-agnostic design specification.
2. Implement native aliases per platform (Android XML/Compose, iOS/macOS color assets, desktop theme resources).
3. Validate key states: default, hover/focus/pressed (where relevant), disabled, error/success.

## 10. Admin Functionality Strategy

Policy:
- Admin functionality remains web-first.
- Native and non-admin-focused clients should default to launching the web admin URL instead of embedding full admin feature parity.

Canonical admin URL:
- `https://audiobook.aedev.pro/admin/overview/`

Implementation guidance:
- If user has admin role, show `Open Admin Console` action.
- Launch external browser or trusted in-app browser tab based on platform guidelines.
- Keep session security in mind; do not leak tokens to URL query strings.

Fallback approach:
- Platform clients may optionally implement a limited admin subset later.
- Until then, link-out is the approved minimum implementation.

## 11. Testing and Regression Expectations

Minimum regression suite for web baseline changes:
- Auth happy path + refresh failure/logout path.
- Library/collection/series load + locale switch behavior.
- Playback start/seek/chapter/progress save behavior.
- Discussions send + realtime receive behavior.
- Role-gated admin link and admin route protection.
- Theme token sanity checks for contrast and state visibility.

## 12. Change Notes

2026-04-10:
- Added explicit baseline policy naming web as minimum functionality source.
- Added token portability contract and semantic token inventory.
- Added formal admin link-out strategy for non-web platforms.
