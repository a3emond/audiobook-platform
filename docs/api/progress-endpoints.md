# Progress API Endpoints

This document is for client developers consuming playback progress APIs.

Base path: `/api/v1/progress`

Authentication: required on all endpoints.

```text
Authorization: Bearer <accessToken>
```

## Overview

Progress is user-scoped and stored per book.

Current capabilities:

- list current user progress entries
- get progress for one book
- save current playback position
- mark a book completed
- reset completion state

## Data Shape

### Progress Object

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "positionSeconds": 1532,
  "durationAtSave": 86400,
  "lastChapterIndex": 4,
  "secondsIntoChapter": 32,
  "completed": false,
  "completedAt": null,
  "manualCompletion": false,
  "lastListenedAt": "2026-04-07T10:00:00.000Z",
  "createdAt": "2026-04-07T10:00:00.000Z",
  "updatedAt": "2026-04-07T10:10:00.000Z"
}
```

## Endpoints

### GET /

List all progress entries for the authenticated user.

Query parameters:

- `limit`: page size, default `20`, max `100`
- `offset`: result offset, default `0`

Example:

```bash
curl "http://localhost:3000/api/progress" \
  -H "Authorization: Bearer <accessToken>"
```

Response:

```json
{
  "progress": [
    {
      "bookId": "507f1f77bcf86cd799439011",
      "positionSeconds": 1532,
      "durationAtSave": 86400,
      "completed": false,
      "manualCompletion": false
    }
  ],
  "total": 1
}
```

Common errors:

- `401` `missing_token`
- `401` `invalid_token`
- `400` `progress_invalid_limit`
- `400` `progress_invalid_offset`

### GET /:bookId

Get progress for the authenticated user on one book.

Common errors:

- `400` `book_invalid_id`
- `404` `progress_not_found`

### PUT /:bookId

Create or update playback progress.

Request body:

```json
{
  "positionSeconds": 1532,
  "durationAtSave": 86400,
  "lastChapterIndex": 4,
  "secondsIntoChapter": 32
}
```

Behavior:

- Upserts progress for `(userId, bookId)`
- Copies current book checksum/version into the saved record
- Updates `lastListenedAt`
- Automatically marks `completed=true` when `positionSeconds >= durationAtSave - 20`

Common errors:

- `400` `book_invalid_id`
- `400` `progress_invalid_position`
- `404` `book_not_found`

### POST /:bookId/complete

Mark a book as completed.

Request body:

```json
{
  "manual": true
}
```

Behavior:

- Requires an existing progress record
- Sets `completed=true`
- Sets `completedAt`
- Stores whether completion was manual

Common errors:

- `400` `book_invalid_id`
- `404` `progress_not_found`

### DELETE /:bookId/complete

Reset completion state to incomplete.

Behavior:

- Requires an existing progress record
- Clears `completedAt`
- Sets `completed=false`
- Resets `manualCompletion=false`

Common errors:

- `400` `book_invalid_id`
- `404` `progress_not_found`

## Typical Client Flow

1. Load library from [Books API Endpoints](./books-endpoints.md).
2. Load `GET /api/progress` to decorate book cards with resume state.
3. Call `PUT /api/progress/:bookId` periodically during playback.
4. Call `POST /api/progress/:bookId/complete` for explicit manual completion.
5. Call `DELETE /api/progress/:bookId/complete` if the user wants to reopen a completed book.

## Related Docs

- [Books API Endpoints](./books-endpoints.md)
- [Auth API Endpoints (Client Guide)](./auth-endpoints.md)
