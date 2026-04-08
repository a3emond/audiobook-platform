# Frontend Implementation Plan

Date: 2026-04-08

## Objective

Deliver an Angular frontend that consumes the full backend API surface with production-ready routing, auth, role-gated admin tools, playback flows, and observability.

## Status

### Completed in current batch

- App shell and navigation scaffolded.
- Route map created with auth/admin guards.
- HTTP API client implemented with typed request helpers.
- Auth service implemented with bootstrap (`/auth/me`) and token persistence.
- Login page implemented (`/auth/login`).
- Library page implemented using `GET /books`.
- Player page implemented with resume + stream + progress save:
  - `GET /streaming/books/:bookId/resume`
  - `GET /books/:bookId`
  - `PUT /progress/:bookId`
- Admin jobs page implemented with initial list (`GET /admin/jobs`) and SSE client wiring for `/admin/jobs/events`.
- Unified profile page now includes listening stats, history, account preferences, and security actions.

### Completed in follow-up batch

- Replaced unauthenticated `EventSource` admin jobs stream with authenticated `fetch`-stream SSE parser using bearer token.
- Added automatic polling fallback when streaming is unavailable.
- Wired real admin upload page to `POST /admin/books/upload` with queued job id feedback.
- Wired real admin books page to `GET /admin/books`.
- Merged settings, history, and stats into a unified profile page backed by `GET /settings`, `PATCH /settings`, `GET /users/me`, `PATCH /users/me`, `GET /stats/me`, and `GET /stats/sessions`.
- Added account security flows on profile via `POST /auth/change-password` and `POST /auth/change-email`.
- Upgraded stats service typing for `GET /stats/me`, `GET /stats/sessions`, and `POST /stats/sessions`.
- Expanded library page with API-backed tabs for books, series, and collections.
- Added collections read/create integration (`GET /collections`, `POST /collections`).
- Added series listing integration (`GET /series`).
- Added series detail route and page integration (`GET /series/:seriesName`).
- Added collection rename/delete flows (`PATCH /collections/:collectionId`, `DELETE /collections/:collectionId`).
- Implemented admin book edit page with live actions:
  - `GET /admin/books/:bookId`
  - `PATCH /admin/books/:bookId/metadata`
  - `PATCH /admin/books/:bookId/chapters`
  - `POST /admin/books/:bookId/extract-cover`
  - `DELETE /admin/books/:bookId`
- Implemented admin users governance page with role updates, session listing, and session revocation:
  - `GET /admin/users`
  - `PATCH /admin/users/:userId/role`
  - `GET /admin/users/:userId/sessions`
  - `DELETE /admin/users/:userId/sessions`
- Implemented auth refresh-and-retry interceptor flow for `401` responses with single-flight token refresh.
- Implemented admin overview dashboard page consuming:
  - `GET /admin/overview`
  - `GET /admin/coverage`
- Implemented collection book-membership editor for `bookIds` updates (`PATCH /collections/:collectionId`).
- Added privacy and terms routes for auth/legal flows.
- Added richer player metadata/details section with description and series quick access.

### Remaining

- Remaining collections and series work: series/collection UX polish and usability refinements.
- Complete admin book management polish (structured chapters UI, richer validation UX).
- Admin overview polish (charts/visualization enhancements).
- End-to-end endpoint coverage tests and contract tests.

---

## API Coverage Matrix and Implementation Tasks

### 1) Auth

Endpoints:
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

Tasks:
- Add register page and account creation flow.
- Refresh-token handling in interceptor with single-flight refresh queue completed.
- Add session expiration UX and forced re-login state.

### 2) Books

Endpoints:
- `GET /books`
- `GET /books/:bookId`

Tasks:
- Add pagination controls using `limit/offset/hasMore`.
- Add full filter panel (`q,title,author,series,genre,language`).
- Add detail route with richer metadata display.

### 3) Series

Endpoints:
- `GET /series`
- `GET /series/:seriesName`

Tasks:
- Add series tab on library page.
- Series detail route implementation completed.

### 4) Collections

Endpoints:
- `GET /collections`
- `POST /collections`
- `GET /collections/:collectionId`
- `PATCH /collections/:collectionId`
- `DELETE /collections/:collectionId`

Tasks:
- Build collections CRUD UI.
- Rename/delete flows completed.
- Book membership editing via `bookIds` update completed.

### 5) Progress

Endpoints:
- `GET /progress`
- `GET /progress/:bookId`
- `PUT /progress/:bookId`
- `POST /progress/:bookId/complete`
- `DELETE /progress/:bookId/complete`

Tasks:
- Add history/resume cards from `GET /progress`.
- Add complete/uncomplete actions in player and book detail.
- Add deterministic idempotency key generation for save calls.

### 6) Settings

Endpoints:
- `GET /settings`
- `PATCH /settings`

Tasks:
- Settings form implementation completed for profile, locale, player, and library preferences.
- Settings UX now lives inside the unified profile page instead of a standalone settings route.
- Add optimistic updates with rollback on failure.

### 7) Users

Endpoints:
- `GET /users/me`
- `PATCH /users/me`

Tasks:
- Profile panel and locale/displayName editing in unified profile completed.
- Email/password self-service account management completed.

### 8) Stats

Endpoints:
- `GET /stats/me`
- `GET /stats/sessions`
- `POST /stats/sessions`

Tasks:
- Sessions history presentation in unified profile completed.
- Add listening session ingestion pipeline from player lifecycle.
- Use idempotency keys for session writes.

### 9) Streaming

Endpoints:
- `GET /streaming/books/:bookId/resume`
- `HEAD /streaming/books/:bookId/audio`
- `GET /streaming/books/:bookId/audio`

Tasks:
- Add resume banner and quick actions.
- Integrate `HEAD` for preflight metadata checks.
- Add robust seek/resume behavior tests.
- Player metadata/details panel completed with description and series jump.

### 10) Admin Overview

Endpoints:
- `GET /admin/overview`
- `GET /admin/coverage`

Tasks:
- Build admin dashboard with counters and queue status widgets.
- Add endpoint capability panel from coverage endpoint.

### 11) Admin Books

Endpoints:
- `POST /admin/books/upload`
- `GET /admin/books`
- `GET /admin/books/:bookId`
- `PATCH /admin/books/:bookId/metadata`
- `PATCH /admin/books/:bookId/chapters`
- `POST /admin/books/:bookId/extract-cover`
- `DELETE /admin/books/:bookId`

Tasks:
- Implement multipart upload flow and job feedback.
- Metadata and chapters editor implementation completed.
- Cover extraction and delete actions implementation completed.

### 12) Admin Jobs

Endpoints:
- `POST /admin/jobs/enqueue`
- `GET /admin/jobs/stats`
- `GET /admin/jobs`
- `GET /admin/jobs/events`
- `GET /admin/jobs/:jobId`
- `DELETE /admin/jobs/:jobId`

Tasks:
- Complete jobs dashboard with filters and pagination.
- Add enqueue forms by job type.
- Add cancellation controls and detail drawer.
- SSE auth fix completed via fetch-stream + polling fallback.
- Improve stream reconnect backoff behavior and status diagnostics.

### 13) Admin Users

Endpoints:
- `GET /admin/users`
- `GET /admin/users/:userId`
- `PATCH /admin/users/:userId/role`
- `GET /admin/users/:userId/sessions`
- `DELETE /admin/users/:userId/sessions`

Tasks:
- User management table with role filter/search completed.
- Role change flow completed.
- Session list/revoke controls completed.

---

## Technical Workstreams

### A) Architecture and State

- Keep service layer API-centric (`core/services/*`).
- Use signals for view-model state in pages.
- Centralize DTO interfaces under `core/models`.

### B) Reliability and Hardening

- Implement refresh-on-401 with request replay.
- Normalize backend error codes to user-facing messages.
- Ensure idempotency keys on write-heavy operations.

### C) Testing

- Service tests per endpoint group (success + error).
- Guard tests for auth/admin route access.
- Component tests for library/player/admin jobs.
- E2E happy paths for consumer and admin personas.

### D) UX and Accessibility

- Keyboard navigable controls.
- Form validation and inline error feedback.
- Loading/skeleton states and empty states.
- Mobile responsive layouts for player and admin tables.

---

## Milestone Plan

### Milestone 1 (Current + next small batch)
- Auth bootstrap, login, route guards.
- Library listing and player resume/stream/progress.

### Milestone 2
- Collections, series, settings, profile.
- Stats sessions and playback ingestion pipeline.

### Milestone 3
- Admin overview/books/jobs/users full implementation.
- Upload/edit/queue governance workflows.

### Milestone 4
- Contract test completion and endpoint matrix sign-off.
- Frontend release candidate.

---

## Definition of Done

- Every backend endpoint has a frontend consumer path (UI action or background process).
- All role-restricted endpoints are shielded in routing and UI.
- Errors and loading states are handled per flow.
- Automated tests cover critical consumer + admin paths.
- API coverage matrix marked complete.
