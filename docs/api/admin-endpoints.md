# Admin API Endpoints

This document is for client developers implementing the admin dashboard.

Base path: `/api/v1/admin`

Authentication and role:

- bearer access token required
- `admin` role required on all endpoints

```text
Authorization: Bearer <accessToken>
```

## Overview

The admin API centralizes management actions for:

- platform overview and admin coverage discovery
- audiobook management workflows
- job queue management and monitoring
- worker configuration and settings
- user management and session control

Consumer-facing APIs remain separate under:

- `/api/v1/books` (read/list)
- `/api/v1/series`
- `/api/v1/progress`
- `/api/v1/settings`
- `/api/v1/collections`

---

## Platform Dashboard Endpoints

### GET /overview

Returns dashboard counters and queue status totals.

**Response body (200 OK):**

```json
{
  "counts": {
    "users": 42,
    "books": 127,
    "collections": 356,
    "jobs": 1024
  },
  "jobsByStatus": {
    "queued": 5,
    "running": 2,
    "retrying": 1,
    "done": 1015,
    "failed": 1
  }
}
```

**Error responses:**

- `401` `missing_token` - No or invalid bearer token
- `403` `forbidden` - User is not admin

---

### GET /coverage

Returns the authoritative list of all admin-only endpoints exposed by the API.

**Response body (200 OK):**

```json
{
  "endpoints": [
    {
      "method": "GET",
      "path": "/api/v1/admin/overview",
      "description": "Dashboard overview metrics"
    },
    {
      "method": "GET",
      "path": "/api/v1/admin/coverage",
      "description": "This endpoint"
    }
    // ... full list of all admin endpoints
  ]
}
```

---

## Book Management Endpoints

### POST /jobs/remediate-cover-overrides

Force-queue a full `RESCAN` pass dedicated to remediating existing books where admin cover overrides must be re-applied.

**Request body:** (empty)

**Response body (202 Accepted):**

```json
{
  "queued": true,
  "jobId": "507f1f77bcf86cd799439011"
}
```

**Behavior:**

- enqueues `RESCAN` with `force: true`
- marks trigger as `manual-admin-cover-remediation` for auditability
- uses worker remediation logic to re-embed admin cover override when drift is detected on existing content

### POST /books/upload

Upload an audiobook file and enqueue ingest processing.

**Request:**
- `POST /api/v1/admin/jobs/remediate-cover-overrides` - Queue forced cover-override remediation rescan

- `multipart/form-data`
- `file` (required): audiobook file (`.m4b`, `.m4a`, `.mp3`, `.ogg`, `.wav`)
- `language` (required): `en` or `fr`

**Response body (201 Created):**

```json
{
  "jobId": "507f1f77bcf86cd799439011"
}
```

**Behavior:**

- writes uploaded file to `/uploads` folder on shared storage
- enqueues an `INGEST` worker job with source path
- ingest job processes file, extracts metadata/chapters, and publishes new book record

**Error responses:**

- `400` `invalid_file` - Missing or invalid file
- `400` `invalid_language` - Language not `en` or `fr`
- `413` `file_too_large` - File exceeds size limit

---

### POST /books/upload/mp3

Upload MP3 file with optional cover image (fast-publish path).

**Request:**

- `multipart/form-data`
- `file` (required): MP3 audiobook file
- `cover` (optional): cover image (JPG/PNG)
- `language` (required): `en` or `fr`
- `title` (optional): book title
- `author` (optional): author name
- `series` (optional): series name
- `genre` (optional): genre tag

**Response body (201 Created):**

```json
{
  "jobId": "507f1f77bcf86cd799439011"
}
```

**Behavior:**

- immediately publishes book with MP3 file and provided metadata
- enqueues `SANITIZE_MP3_TO_M4B` job for deferred M4B conversion
- book is available for streaming immediately while conversion happens in background
- after conversion completes, book seamlessly switches to M4B file

---

### GET /books

List all books with optional filters and pagination.

**Query parameters:**

- `q` (optional): search by title, author, series (partial match)
- `language` (optional): filter by `en` or `fr`
- `limit` (optional): page size, default `20`, max `100`
- `offset` (optional): result offset, default `0`

**Response body (200 OK):**

```json
{
  "books": [
    {
      "id": "507f1f77bcf86cd799439011",
      "title": "The Great Gatsby",
      "author": "F. Scott Fitzgerald",
      "series": "Classic Literature",
      "seriesIndex": 1,
      "language": "en",
      "duration": 86400,
      "chapters": 42,
      "coverPath": "/data/audiobooks/.../cover.jpg",
      "processingState": "ready",
      "createdAt": "2026-04-07T10:00:00.000Z",
      "updatedAt": "2026-04-07T10:00:00.000Z"
    }
  ],
  "total": 127,
  "limit": 20,
  "offset": 0
}
```

---

### GET /books/:bookId

Get detailed information about a specific book.

**Response body (200 OK):**

```json
{
  "id": "507f1f77bcf86cd799439011",
  "filePath": "/data/audiobooks/507f1f77bcf86cd799439011/audio.m4b",
  "checksum": "sha256:a1b2c3d4e5f6...",
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "series": "Classic Literature",
  "seriesIndex": 1,
  "duration": 86400,
  "language": "en",
  "chapters": [
    {
      "index": 0,
      "title": "Chapter 1",
      "start": 0,
      "end": 3600
    }
  ],
  "coverPath": "/data/audiobooks/507f1f77bcf86cd799439011/cover.jpg",
  "processingState": "ready",
  "createdAt": "2026-04-07T10:00:00.000Z",
  "updatedAt": "2026-04-07T10:00:00.000Z"
}
```

**Error responses:**

- `404` `book_not_found` - Book ID doesn't exist

---

### PATCH /books/:bookId/metadata

Update book metadata fields.

**Request body:**

```json
{
  "title": "Updated Title",
  "author": "Updated Author",
  "series": "Updated Series",
  "seriesIndex": 2,
  "genre": "Fiction"
}
```

**Response body (200 OK):** Updated book object

**Behavior:**

- updates metadata in database immediately
- does not trigger FFmpeg remuxing (use WRITE_METADATA job for that)

---

### PATCH /books/:bookId/chapters

Update chapter information for a book.

**Request body:**

```json
{
  "chapters": [
    {
      "index": 0,
      "title": "Prologue",
      "start": 0,
      "end": 1800
    },
    {
      "index": 1,
      "title": "Chapter 1",
      "start": 1800,
      "end": 3600
    }
  ]
}
```

**Response body (200 OK):** Updated book object

**Behavior:**

- updates chapter metadata in database
- for embedding chapters into audio file, enqueue WRITE_METADATA job instead

---

### POST /books/:bookId/extract-cover

Enqueue cover extraction from audio file.

**Request body:** (empty)

**Response body (201 Created):**

```json
{
  "jobId": "507f1f77bcf86cd799439011"
}
```

**Behavior:**

- enqueues EXTRACT_COVER job to extract cover image from embedded metadata
- job will overwrite existing cover if successful

---

### DELETE /books/:bookId

Delete a book and all associated files.

**Request body:** (empty)

**Response body (204 No Content)**

**Behavior:**

- enqueues DELETE_BOOK job
- job removes book record from database and deletes all files from storage
- cannot be undone

---

## Worker Settings Endpoints

### GET /worker-settings

Get current worker queue configuration.

**Response body (200 OK):**

```json
{
  "queue": {
    "heavyJobTypes": ["SANITIZE_MP3_TO_M4B", "REPLACE_FILE"],
    "heavyJobDelayMs": 0,
    "heavyWindowEnabled": false,
    "heavyWindowStart": "03:00",
    "heavyWindowEnd": "05:00",
    "heavyConcurrency": 2,
    "fastConcurrency": 4
  },
  "parity": {
    "enabled": true,
    "intervalMs": 3600000
  },
  "taxonomy": {
    "enabled": true,
    "intervalMs": 3600000
  }
}
```

**Configuration fields:**

- `heavyJobTypes`: job types that are considered "heavy" (CPU/IO intensive)
- `heavyJobDelayMs`: additional delay for heavy jobs (default 0)
- `heavyWindowEnabled`: if true, heavy jobs can only run during configured time window
- `heavyWindowStart`/`heavyWindowEnd`: time window in HH:MM format (midnight crossover supported)
- `heavyConcurrency`: max concurrent jobs on "any" lane
- `fastConcurrency`: max concurrent jobs on "fast" lane (excludes heavy jobs)
- `parity.enabled` / `parity.intervalMs`: scheduled RESCAN policy
- `taxonomy.enabled` / `taxonomy.intervalMs`: scheduled SYNC_TAGS policy

---

### PATCH /worker-settings

Update worker queue configuration.

**Request body:**

```json
{
  "queue": {
    "heavyJobTypes": ["SANITIZE_MP3_TO_M4B", "REPLACE_FILE"],
    "heavyJobDelayMs": 3600000,
    "heavyWindowEnabled": true,
    "heavyWindowStart": "03:00",
    "heavyWindowEnd": "05:00",
    "heavyConcurrency": 2,
    "fastConcurrency": 4
  },
  "parity": {
    "enabled": true,
    "intervalMs": 3600000
  },
  "taxonomy": {
    "enabled": true,
    "intervalMs": 3600000
  }
}
```

**Response body (200 OK):** Updated worker settings

**Behavior:**

- changes take effect immediately on next worker poll cycle
- heavy jobs already running will not be affected

---

## Job Management Endpoints

See [Job Queue API Reference](./jobs-endpoints.md) for complete job queue documentation.

Quick summary:

- `POST /api/v1/admin/jobs/enqueue` - Create and queue a job
- `GET /api/v1/admin/jobs` - List jobs with filters
- `GET /api/v1/admin/jobs/stats` - Get queue statistics
- `GET /api/v1/admin/jobs/events` - Stream live job updates via SSE
- `GET /api/v1/admin/jobs/:jobId` - Get job details and status
- `GET /api/v1/admin/jobs/:jobId/logs` - Get job execution logs
- `DELETE /api/v1/admin/jobs/:jobId` - Cancel a queued job
- `GET /api/v1/admin/logs` - Search logs across jobs

---

## User Management Endpoints

### GET /users

List all users with optional filters.

**Query parameters:**

- `q` (optional): search by email or display name (partial match)
- `role` (optional): filter by `admin` or `user`
- `limit` (optional): page size, default `20`, max `100`
- `offset` (optional): result offset, default `0`

**Response body (200 OK):**

```json
{
  "users": [
    {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "role": "user",
      "profile": {
        "displayName": "Alice",
        "preferredLocale": "en"
      },
      "createdAt": "2026-01-01T10:00:00.000Z",
      "updatedAt": "2026-04-07T10:00:00.000Z"
    }
  ],
  "total": 42
}
```

---

### GET /users/:userId

Get user details and profile information.

**Response body (200 OK):** Single user object (same shape as list)

**Error responses:**

- `404` `user_not_found` - User ID doesn't exist

---

### PATCH /users/:userId/role

Change a user's role.

**Request body:**

```json
{
  "role": "admin"
}
```

**Response body (200 OK):** Updated user object

**Safeguards:**

- cannot demote your own account from admin to user
- cannot demote the last remaining admin account

**Error responses:**

- `400` `user_invalid_role` - Role not `admin` or `user`
- `400` `user_cannot_demote_self` - Cannot demote own account
- `400` `user_last_admin_demote_forbidden` - Cannot demote last admin
- `404` `user_not_found` - User ID doesn't exist

---

### GET /users/:userId/sessions

List all refresh-token sessions for a user.

**Query parameters:**

- `limit` (optional): page size, default `20`, max `100`
- `offset` (optional): result offset, default `0`

**Response body (200 OK):**

```json
{
  "sessions": [
    {
      "id": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439099",
      "device": "web",
      "ip": "127.0.0.1",
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "expiresAt": "2026-06-06T10:00:00.000Z",
      "lastUsedAt": "2026-04-10T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### DELETE /users/:userId/sessions

Revoke all active sessions for a user (forces re-login).

**Response body (200 OK):**

```json
{
  "revoked": 3
}
```

**Behavior:**

- invalidates all refresh tokens for the user
- user will be forced to login again on all devices

---

## Error Handling

### Common Auth/Role Errors

All admin endpoints may return these errors:

| Status | Code            | Cause                                      |
| ------ | --------------- | ------------------------------------------ |
| 401    | `missing_token` | No `Authorization` header or invalid token |
| 401    | `invalid_token` | Token is expired or malformed              |
| 403    | `forbidden`     | User does not have admin role              |

### Domain-Specific Errors

Specific endpoints return additional errors documented in their sections above.

---

## Related Docs

- [Job Queue API Reference](./jobs-endpoints.md)
- [Books API Endpoints](./books-endpoints.md)
- [Worker Technical Reference](../worker/technical-reference.md)
- [API & Worker Integration Guide](../platform/api-worker-integration.md)
