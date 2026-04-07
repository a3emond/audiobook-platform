# API Functionality Coverage Audit

This document audits the current API surface against what a production-grade audiobook streaming platform should provide.

Date: 2026-04-07

Note on versioning:
- Canonical routes are available under `/api/v1/*`.
- Legacy `/api/*` aliases remain mounted for backward compatibility.

## Scope

Audited API surfaces:
- auth and sessions
- consumer catalog and personalization
- streaming
- stats
- admin management
- worker/job orchestration

## Current Endpoint Coverage

### Auth

Implemented:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/oauth/google`
- `POST /api/auth/oauth/apple`
- `GET /api/auth/me`

Status: good baseline coverage.

### Consumer Library and Personalization

Implemented:
- Books (read-only consumer):
  - `GET /api/books`
  - `GET /api/books/:bookId`
- Series (read-only app-level):
  - `GET /api/series`
  - `GET /api/series/:seriesName`
- Progress:
  - `GET /api/progress`
  - `GET /api/progress/:bookId`
  - `PUT /api/progress/:bookId`
  - `POST /api/progress/:bookId/complete`
  - `DELETE /api/progress/:bookId/complete`
- Settings:
  - `GET /api/settings`
  - `PATCH /api/settings`
- Collections (user-scoped):
  - `GET /api/collections`
  - `POST /api/collections`
  - `GET /api/collections/:collectionId`
  - `PATCH /api/collections/:collectionId`
  - `DELETE /api/collections/:collectionId`
- Users (current user profile):
  - `GET /api/users/me`
  - `PATCH /api/users/me`

Status: strong client-consumption baseline.

### Streaming

Implemented:
- `GET /streaming/books/:bookId/resume`
- `HEAD /streaming/books/:bookId/audio`
- `GET /streaming/books/:bookId/audio`

Supported behaviors:
- routing outside `/api` for reverse proxy compatibility
- byte range support (`bytes=start-end`, `bytes=start-`, `bytes=-suffix`)
- resume info derived from progress + resume-rewind settings
- cache validators (`ETag`, `Last-Modified`, `If-Range`) for stronger client/proxy revalidation

Status: good baseline for direct file streaming.

### Stats and Sessions

Implemented:
- `GET /api/stats/me`
- `GET /api/stats/sessions`
- `POST /api/stats/sessions`

Status: baseline analytics for user listening lifecycle.

### Admin and Jobs

Implemented (admin-only under `/api/admin`):
- platform:
  - `GET /api/admin/overview`
  - `GET /api/admin/coverage`
- books management:
  - `POST /api/admin/books/upload`
  - `GET /api/admin/books`
  - `GET /api/admin/books/:bookId`
  - `PATCH /api/admin/books/:bookId/metadata`
  - `PATCH /api/admin/books/:bookId/chapters`
  - `POST /api/admin/books/:bookId/extract-cover`
  - `DELETE /api/admin/books/:bookId`
- jobs management:
  - `POST /api/admin/jobs/enqueue`
  - `GET /api/admin/jobs/stats`
  - `GET /api/admin/jobs`
  - `GET /api/admin/jobs/events`
  - `GET /api/admin/jobs/:jobId`
  - `DELETE /api/admin/jobs/:jobId`
- users management:
  - `GET /api/admin/users`
  - `GET /api/admin/users/:userId`
  - `PATCH /api/admin/users/:userId/role`
  - `GET /api/admin/users/:userId/sessions`
  - `DELETE /api/admin/users/:userId/sessions`

Status: complete for current worker-backed operations.

## Platform Capability Matrix

### Core playback capabilities

- Account auth and session continuity: covered.
- Library browse/search/filter: covered.
- Series grouping: covered.
- User progress persistence: covered.
- Resume from saved position with rewind policy: covered.
- HTTP range-based seeking: covered.

### Library personalization capabilities

- User collections: covered.
- User settings and player preferences: covered.
- Profile/localization preferences: covered.

### Operator/admin capabilities

- Upload, ingest, and publish books from admin app flow: covered.
- Metadata and chapter management: covered.
- Cover extraction and delete workflows via jobs: covered.
- Queue visibility and cancellation: covered.
- User role management and session revocation: covered.

### Analytics capabilities

- Session ingestion: covered.
- Aggregated user stats: covered.

## Gaps and Recommended Changes

The API is feature-complete for a functional v1 and includes the prior P0/P1 hardening set.

### P0 (completed)

1. Added rate limiting and auth abuse protection.
2. Added idempotency support for write-heavy endpoints (session ingest, job enqueue, progress save).
3. Added pagination consistency metadata (`limit`, `offset`, `hasMore`) on list endpoints.
4. Added request validation middleware for stats/users/streaming routes.

### P1 (completed)

1. Added admin audit log trail for management actions.
2. Added job event streaming support to reduce dashboard polling load.
3. Added explicit API versioning strategy (`/api/v1`) with backward-compatible `/api` alias.
4. Added stronger streaming cache validators (`ETag`, `Last-Modified`, `If-Range` handling).

### P2 (future platform evolution)

1. Add bookmarks/highlights/notes per user per book.
2. Add transcoding/alternate rendition strategy for broader device/network support.
3. Add optional signed streaming URLs for CDN/offload scenarios.
4. Add recommendation/discovery endpoints once behavior data grows.

## Readiness Summary

Current API readiness for frontend build:
- Authentication and user identity: ready.
- Core library consumption and playback: ready.
- Admin operations and background job orchestration: ready.
- Admin user governance (roles and access revocation): ready.
- Streaming resume + seek semantics: ready.

Remaining work is mostly hardening, observability, and scale ergonomics rather than missing core product functionality.