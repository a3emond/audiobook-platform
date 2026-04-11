# API Functionality Coverage Audit

This document audits the current API surface against production-grade audiobook streaming platform requirements.

**Last Updated**: 2026-04-11  
**Status**: Complete and production-ready for v1

## Note on API Versioning

- Canonical routes are available under `/api/v1/*` exclusively
- All endpoints are fully authenticated and role-gated where applicable
- No legacy `/api/*` path support

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

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/oauth/google`
- `POST /api/v1/auth/oauth/apple`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/change-password`
- `POST /api/v1/auth/change-email`

Status: good baseline coverage.

### Consumer Library and Personalization

Implemented:

- Books (read-only consumer):
  - `GET /api/v1/books`
  - `GET /api/v1/books/:bookId`
- Series (read-only app-level):
  - `GET /api/v1/series`
  - `GET /api/v1/series/:seriesName`
- Progress:
  - `GET /api/v1/progress`
  - `GET /api/v1/progress/:bookId`
  - `PUT /api/v1/progress/:bookId`
  - `POST /api/v1/progress/:bookId/complete`
  - `DELETE /api/v1/progress/:bookId/complete`
- Settings:
  - `GET /api/v1/settings`
  - `PATCH /api/v1/settings`
- Collections (user-scoped):
  - `GET /api/v1/collections`
  - `POST /api/v1/collections`
  - `GET /api/v1/collections/:collectionId`
  - `PATCH /api/v1/collections/:collectionId`
  - `DELETE /api/v1/collections/:collectionId`
- Discussions (language-scoped messaging):
  - `GET /api/v1/discussions/channels` (list channels)
  - `POST /api/v1/discussions/channels` (create, admin-only)
  - `DELETE /api/v1/discussions/:lang/:channelKey` (delete, admin-only)
  - `GET /api/v1/discussions/:lang/:channelKey/messages` (list messages)
  - `POST /api/v1/discussions/:lang/:channelKey/messages` (post message)
  - `DELETE /api/v1/discussions/:lang/:channelKey/messages/:messageId` (delete, admin-only)
- Users (current user profile):
  - `GET /api/v1/users/me`
  - `PATCH /api/v1/users/me`

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

- `GET /api/v1/stats/me`
- `GET /api/v1/stats/sessions`
- `POST /api/v1/stats/sessions`

Status: baseline analytics for user listening lifecycle.

### Admin and Jobs

Implemented (admin-only under `/api/v1/admin`):

- platform:
  - `GET /api/v1/admin/overview`
  - `GET /api/v1/admin/coverage`
- books management:
  - `POST /api/v1/admin/books/upload`
  - `POST /api/v1/admin/books/upload/url` (image URL for cover)
  - Batch upload support via sequential queue
  - `GET /api/v1/admin/books`
  - `GET /api/v1/admin/books/:bookId`
  - `PATCH /api/v1/admin/books/:bookId/metadata`
  - `PATCH /api/v1/admin/books/:bookId/chapters`
  - `POST /api/v1/admin/books/:bookId/extract-cover`
  - Cover image URL support via `prepareCoverImageFromUrl`
  - `DELETE /api/v1/admin/books/:bookId`
- jobs management:
  - `POST /api/v1/admin/jobs/enqueue`
  - `GET /api/v1/admin/jobs/stats`
  - `GET /api/v1/admin/jobs`
  - `GET /api/v1/admin/jobs/events`
  - `GET /api/v1/admin/jobs/:jobId`
  - `DELETE /api/v1/admin/jobs/:jobId`
- users management:
  - `GET /api/v1/admin/users`
  - `GET /api/v1/admin/users/:userId`
  - `PATCH /api/v1/admin/users/:userId/role`
  - `GET /api/v1/admin/users/:userId/sessions`
  - `DELETE /api/v1/admin/users/:userId/sessions`

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
- Account security self-service for password-based accounts: covered.
- Discussions and community messaging: covered.

### Discussion and Community capabilities

- Language-scoped discussion channels: covered.
- Message creation and deletion: covered.
- Admin channel management: covered.

### Operator/admin capabilities

- Upload, ingest, and publish books from admin app flow: covered.
- Batch upload queue with per-item language and cover selection: covered.
- Image URL cover assignment and validation: covered.
- Metadata and chapter management: covered.
- Cover extraction and delete workflows via jobs: covered.
- Job restart, rerun, and manual parity scan triggers: covered.
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
3. Added explicit API versioning strategy with `/api/v1` as the sole supported route prefix.
4. Added stronger streaming cache validators (`ETag`, `Last-Modified`, `If-Range` handling).

### P2 (future platform evolution)

1. Add bookmarks/highlights/notes per user per book.
2. Add transcoding/alternate rendition strategy for broader device/network support.
3. Add optional signed streaming URLs for CDN/offload scenarios.
4. Add recommendation/discovery endpoints once behavior data grows.

## Readiness Summary (April 2026)

Current API readiness status for all platforms:

✅ **Authentication and User Identity**

- Email/password auth with JWT tokens
- OAuth2 (Google, Apple)
- Session management and refresh tokens
- Password/email self-service changes
- Admin role and session management

✅ **Core Library Consumption**

- Book catalog browsing and search
- Series and collection management
- Book metadata and chapter information
- Language-scoped filtering

✅ **Playback and Progress**

- Resume position tracking with policy support
- HTTP Range request support for seeking
- Chapter navigation and progress saving
- Completion tracking

✅ **Community and Engagement**

- Language-scoped discussion channels
- Real-time message delivery
- User profile customization

✅ **Admin Operations and Background Processing**

- Asynchronous job queue with monitoring
- Book upload and ingestion (M4B, MP3 fast-publish)
- Metadata and chapter management
- Cover image handling
- User administration
- Worker settings configuration

✅ **Analytics and Observability**

- Listening session tracking
- Aggregated user statistics
- Admin audit logging

## Product Feature Completeness

The API provides complete coverage for a v1 audiobook streaming platform with:

1. **Consumer-facing features** (books, playlists, playback, discussions, progress)
2. **Admin operations** (book & user management, job orchestration)
3. **Reliability features** (retries, idempotency, rate limiting, audit trails)
4. **Performance optimizations** (pagination, caching, streaming with range support)

No significant gaps remain for MVP launch. Future enhancements (P2) are purely additive and don't block core functionality.
