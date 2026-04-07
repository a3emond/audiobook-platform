# Admin API Endpoints

This document is for client developers implementing the admin dashboard.

Base path: `/api/admin`

Authentication and role:
- bearer access token required
- `admin` role required on all endpoints

```text
Authorization: Bearer <accessToken>
```

## Overview

The admin API centralizes management actions for:
- platform overview and admin coverage discovery
- book management workflows
- job queue management

Consumer-facing APIs remain separate under:
- `/api/books` (read/list)
- `/api/series`
- `/api/progress`
- `/api/settings`
- `/api/collections`

## Platform Endpoints

### GET /overview

Returns dashboard counters and queue status totals.

Response shape:

```json
{
  "counts": {
    "users": 0,
    "books": 0,
    "collections": 0,
    "jobs": 0
  },
  "jobsByStatus": {
    "queued": 0,
    "running": 0,
    "retrying": 0,
    "done": 0,
    "failed": 0
  }
}
```

### GET /coverage

Returns the authoritative list of admin-only endpoints exposed by the API.

## Book Management Endpoints

### POST /books/upload

Upload an audiobook file from the admin app and enqueue ingest.

Request:
- `multipart/form-data`
- file field name: `file`
- supported extensions: `.m4b`, `.m4a`, `.mp3`, `.ogg`, `.wav`

Response:

```json
{
  "jobId": "507f1f77bcf86cd799439011"
}
```

Behavior:
- writes the uploaded file to shared server storage under an internal uploads folder
- enqueues an `INGEST` worker job with source path
- ingest job copies audio to final library location and can clean temporary upload source

### GET /books

Admin list/read surface for books dashboard screens.

Supports the same query filters as consumer books list:
- `q`, `title`, `author`, `series`, `genre`, `language`, `limit`, `offset`

### GET /books/:bookId

Get one book for admin editing.

### PATCH /books/:bookId/metadata

Update managed metadata fields.

### PATCH /books/:bookId/chapters

Replace chapter definitions and enqueue metadata write.

### POST /books/:bookId/extract-cover

Enqueue cover extraction for the book.

### DELETE /books/:bookId

Enqueue full deletion of the book and files.

## Job Management Endpoints

### POST /jobs/enqueue

Enqueue any supported background job type.

### GET /jobs/stats

Get queue counters by status.

### GET /jobs

List jobs with filters and pagination.

### GET /jobs/:jobId

Get one job and its execution details.

### DELETE /jobs/:jobId

Cancel queued jobs.

## User Management Endpoints

### GET /users

List users for admin management.

Query parameters:
- `q`: partial match on email and display name
- `role`: `admin` or `user`
- `limit`: page size, default `20`, max `100`
- `offset`: result offset, default `0`

### GET /users/:userId

Get one user by id.

### PATCH /users/:userId/role

Change a user's role.

Request body:

```json
{
  "role": "admin"
}
```

Safeguards:
- cannot demote your own account from admin to user
- cannot demote the last remaining admin account

Common errors:
- `400` `user_invalid_role`
- `400` `user_cannot_demote_self`
- `400` `user_last_admin_demote_forbidden`
- `404` `user_not_found`

### GET /users/:userId/sessions

List refresh-token sessions for a user.

Query parameters:
- `limit`: page size, default `20`, max `100`
- `offset`: result offset, default `0`

Response shape:

```json
{
  "sessions": [
    {
      "id": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439099",
      "device": "web",
      "ip": "127.0.0.1",
      "userAgent": "Mozilla/5.0",
      "expiresAt": "2026-06-06T10:00:00.000Z",
      "lastUsedAt": "2026-04-07T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

### DELETE /users/:userId/sessions

Revoke all refresh-token sessions for the user.

Response:

```json
{
  "revoked": 3
}
```

## Error Expectations

Common auth/role errors across all admin endpoints:
- `401` `missing_token` (or unauthorized token)
- `403` `forbidden`

Domain-specific errors match the underlying books and jobs handlers.

## Related Docs

- [Books API Endpoints](./books-endpoints.md)
- [Jobs API Endpoints](./jobs-endpoints.md)
- [Worker Technical Reference](../worker/technical-reference.md)
- [API Worker Integration Guide](../platform/api-worker-integration.md)