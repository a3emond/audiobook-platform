# Books API Endpoints

This document is for client developers consuming the books API.

Base path: `/api/v1/books`

Authentication: required on all endpoints.

```text
Authorization: Bearer <accessToken>
```

## Overview

The books API exposes the audiobook library already ingested by the worker pipeline.

Current capabilities:

- list all books with search/filter
- get detailed book information
- retrieve book metadata, chapters, and formatting

Book management endpoints (admin-only) are documented separately in [Admin API Endpoints](./admin-endpoints.md).

## Data Shape

### Book Object

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
      "end": 120000
    }
  ],
  "coverPath": "/data/audiobooks/507f1f77bcf86cd799439011/cover.jpg",
  "tags": ["classic", "fiction"],
  "genre": "Audiobook",
  "description": {
    "default": "A classic novel",
    "fr": null,
    "en": "A classic novel"
  },
  "overrides": {
    "title": false,
    "author": false,
    "series": false,
    "seriesIndex": false,
    "chapters": false,
    "cover": false,
    "description": false
  },
  "fileSync": {
    "status": "in_sync",
    "lastReadAt": "2026-04-07T10:00:00.000Z",
    "lastWriteAt": "2026-04-07T10:00:00.000Z"
  },
  "version": 1,
  "lastScannedAt": "2026-04-07T10:00:00.000Z",
  "createdAt": "2026-04-07T10:00:00.000Z",
  "updatedAt": "2026-04-07T10:00:00.000Z"
}
```

## Endpoints

### GET /

List books.

Query parameters:

- `q`: partial match across title, author, series, genre, and tags
- `title`: case-insensitive partial title filter
- `author`: case-insensitive author filter
- `series`: case-insensitive partial series filter
- `genre`: case-insensitive partial genre filter
- `language`: case-insensitive partial language filter
- `limit`: page size, default `20`
- `offset`: result offset, default `0`

Example:

```bash
curl "http://localhost:3000/api/books?q=gatsby&limit=10" \
  -H "Authorization: Bearer <accessToken>"
```

Example with explicit filters:

```bash
curl "http://localhost:3000/api/books?title=gatsby&author=fitz&genre=fiction&series=classic" \
  -H "Authorization: Bearer <accessToken>"
```

Response:

```json
{
  "books": [
    {
      "id": "507f1f77bcf86cd799439011",
      "title": "The Great Gatsby",
      "author": "F. Scott Fitzgerald",
      "duration": 86400,
      "chapters": []
    }
  ],
  "total": 1
}
```

Common errors:

- `401` `missing_token`
- `401` `invalid_token`

### GET /:bookId

Get a single book.

Example:

```bash
curl "http://localhost:3000/api/books/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer <accessToken>"
```

Common errors:

- `400` `book_invalid_id`
- `404` `book_not_found`

## Admin-managed Book Actions

These actions are not exposed under `/api/books`. They are available only under:

- `PATCH /api/admin/books/:bookId/metadata`
- `PATCH /api/admin/books/:bookId/chapters`
- `POST /api/admin/books/:bookId/extract-cover`
- `DELETE /api/admin/books/:bookId`

## Typical Client Flow

1. Call `GET /api/books` to show library results.
2. Call `GET /api/books/:bookId` to display full details.
3. For management actions (metadata/chapters/cover/delete), use [Admin API Endpoints](./admin-endpoints.md).

## Related Docs

- [Jobs API Endpoints](./jobs-endpoints.md)
- [Progress API Endpoints](./progress-endpoints.md)
- [Series API Endpoints](./series-endpoints.md)
- [Admin API Endpoints](./admin-endpoints.md)
- [Worker Technical Reference](../worker/technical-reference.md)
