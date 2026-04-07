# Stats API Endpoints

This document is for client developers consuming listening stats APIs.

Base path: `/api/stats`

Authentication: required on all endpoints.

```text
Authorization: Bearer <accessToken>
```

## Overview

Stats endpoints are scoped to the authenticated user.

Current capabilities:
- fetch aggregated lifetime and rolling stats
- record listening sessions
- list recorded listening sessions

## Endpoints

### GET /me

Get the current user stats aggregate.

Response:

```json
{
  "lifetime": {
    "totalListeningSeconds": 12345,
    "completedBooksCount": 0,
    "distinctBooksStarted": 4,
    "distinctBooksCompleted": 0,
    "totalSessions": 20,
    "totalSeekCount": 0,
    "totalForwardJumps": 0,
    "totalBackwardJumps": 0,
    "lastListeningAt": "2026-04-07T10:00:00.000Z"
  },
  "rolling": {
    "last7DaysListeningSeconds": 7200,
    "last30DaysListeningSeconds": 12400
  }
}
```

### GET /sessions

List listening sessions for the current user.

Query parameters:
- `bookId`: optional filter by book id
- `limit`: page size, default `20`, max `100`
- `offset`: result offset, default `0`

Response:

```json
{
  "sessions": [
    {
      "id": "507f1f77bcf86cd799439011",
      "bookId": "507f1f77bcf86cd799439099",
      "startedAt": "2026-04-07T10:00:00.000Z",
      "endedAt": "2026-04-07T10:10:00.000Z",
      "listenedSeconds": 600,
      "startPositionSeconds": 120,
      "endPositionSeconds": 720,
      "device": "web"
    }
  ],
  "total": 1
}
```

Common errors:
- `400` `session_invalid_limit`
- `400` `session_invalid_offset`
- `400` `book_invalid_id`

### POST /sessions

Record one listening session for the current user.

Request body:

```json
{
  "bookId": "507f1f77bcf86cd799439099",
  "startedAt": "2026-04-07T10:00:00.000Z",
  "endedAt": "2026-04-07T10:10:00.000Z",
  "listenedSeconds": 600,
  "startPositionSeconds": 120,
  "endPositionSeconds": 720,
  "device": "web"
}
```

Common errors:
- `400` `session_invalid_dates`
- `400` `session_invalid_dates_order`
- `400` `session_invalid_positions`
- `400` `book_invalid_id`
- `404` `book_not_found`

## Related Docs

- [Progress API Endpoints](./progress-endpoints.md)
- [Books API Endpoints](./books-endpoints.md)