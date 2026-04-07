# Streaming API Endpoints

This document is for client developers consuming audiobook streaming endpoints.

Base path: `/streaming`

Authentication: required on all endpoints.

```text
Authorization: Bearer <accessToken>
```

## Routing Note

Streaming routes are intentionally outside `/api` to align with reverse-proxy infrastructure. Use:
- `https://<domain>/streaming/...`

## Endpoints

### GET /books/:bookId/resume

Return server-computed resume info for a book, based on the user's saved progress.

Behavior:
- reads current playback position from progress data
- applies resume-rewind policy from user settings when applicable
- returns a canonical `streamPath` to use for audio requests

Response:

```json
{
  "bookId": "507f1f77bcf86cd799439099",
  "streamPath": "/streaming/books/507f1f77bcf86cd799439099/audio",
  "positionSeconds": 1532,
  "startSeconds": 1502,
  "durationSeconds": 86400,
  "canResume": true,
  "appliedRewind": true
}
```

### GET /books/:bookId/audio

Stream the audiobook file for a book.

Supported behavior:
- supports HTTP range requests (`Range: bytes=start-end`)
- returns `206 Partial Content` for ranged responses
- returns `200 OK` for full-file responses when no range is sent
- sets `Accept-Ranges: bytes`

Example with range request:

```bash
curl "http://localhost:3000/streaming/books/507f1f77bcf86cd799439099/audio" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Range: bytes=0-1048575" \
  -o chunk.bin
```

Common errors:
- `400` `book_invalid_id`
- `401` `missing_token`
- `404` `book_not_found`
- `404` `stream_file_not_found`
- `416` `stream_invalid_range`

## Related Docs

- [Books API Endpoints](./books-endpoints.md)
- [API Worker Integration Guide](../platform/api-worker-integration.md)