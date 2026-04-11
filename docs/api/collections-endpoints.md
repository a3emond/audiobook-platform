# Collections API Endpoints

This document is for client developers consuming collection management APIs.

Base path: `/api/v1/collections`

Authentication: required on all endpoints.

```text
Authorization: Bearer <accessToken>
```

## Overview

Collections are user-scoped named book lists.

Current capabilities:

- list collections
- get one collection
- create a collection
- rename a collection
- replace the set of books in a collection
- delete a collection

## Data Shape

### Collection Object

```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "Road Trip Queue",
  "bookIds": ["507f1f77bcf86cd799439101", "507f1f77bcf86cd799439102"],
  "cover": null,
  "createdAt": "2026-04-07T10:00:00.000Z",
  "updatedAt": "2026-04-07T10:10:00.000Z"
}
```

## Endpoints

### GET /

List collections for the authenticated user.

Query parameters:

- `limit`: page size, default `20`, max `100`
- `offset`: result offset, default `0`

Example:

```bash
curl "http://localhost:3000/api/collections" \
  -H "Authorization: Bearer <accessToken>"
```

Response:

```json
{
  "collections": [
    {
      "id": "507f1f77bcf86cd799439011",
      "name": "Road Trip Queue",
      "bookIds": ["507f1f77bcf86cd799439101"],
      "cover": null,
      "createdAt": "2026-04-07T10:00:00.000Z",
      "updatedAt": "2026-04-07T10:10:00.000Z"
    }
  ],
  "total": 1
}
```

Behavior:

- returns only the caller's own collections

Common errors:

- `400` `collection_invalid_limit`
- `400` `collection_invalid_offset`

### GET /:collectionId

Get one collection by id.

Behavior:

- returns only collections owned by the authenticated user

Common errors:

- `400` `collection_invalid_id`
- `404` `collection_not_found`

### POST /

Create a collection.

Request body:

```json
{
  "name": "Favorites"
}
```

Behavior:

- trims collection names before saving
- initializes with an empty `bookIds` array
- automatically attaches the collection to the authenticated user

Common errors:

- `400` `collection_name_required`

### PATCH /:collectionId

Update collection fields.

Request body:

```json
{
  "name": "Summer Listening",
  "bookIds": ["507f1f77bcf86cd799439101", "507f1f77bcf86cd799439102"]
}
```

Behavior:

- accepts either `name`, `bookIds`, or both
- validates each `bookIds` entry as a Mongo object id
- rejects updates when any referenced book does not exist
- replaces the entire `bookIds` set when provided

Common errors:

- `400` `collection_invalid_id`
- `400` `collection_name_required`
- `400` `collection_invalid_book_id`
- `400` `collection_empty_update`
- `404` `collection_not_found`
- `404` `collection_book_not_found`

### DELETE /:collectionId

Delete a collection.

Response:

- `204 No Content` on success

Common errors:

- `400` `collection_invalid_id`
- `404` `collection_not_found`

## Typical Client Flow

1. Load `GET /api/collections` to render user-defined book groupings.
2. Create new lists with `POST /api/collections`.
3. Persist reorder or membership changes with `PATCH /api/collections/:collectionId`.
4. Use [Books API Endpoints](./books-endpoints.md) to resolve each `bookId` into display data.
5. Do not expect app-level series groupings here; those are exposed separately by [Series API Endpoints](./series-endpoints.md).

## Related Docs

- [Books API Endpoints](./books-endpoints.md)
- [Auth API Endpoints (Client Guide)](./auth-endpoints.md)
- [Series API Endpoints](./series-endpoints.md)
