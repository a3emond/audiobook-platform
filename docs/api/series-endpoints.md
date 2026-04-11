# Series API Endpoints

This document is for client developers consuming app-level read-only series APIs.

Base path: `/api/v1/series`

Authentication: required on all endpoints.

```text
Authorization: Bearer <accessToken>
```

## Overview

Series are derived from book metadata already stored on each book.

Current capabilities:

- list series discovered from books
- filter series by partial title, author, series name, genre, language, or general query text
- fetch one series and its ordered books

Series are not user-editable collections.

## Data Shape

### Series Summary

```json
{
  "id": "classic-literature",
  "name": "Classic Literature",
  "bookCount": 3,
  "totalDuration": 240000,
  "authors": ["F. Scott Fitzgerald"],
  "genres": ["Fiction"],
  "coverPath": "/data/audiobooks/507f1f77bcf86cd799439011/cover.jpg"
}
```

### Series Detail

```json
{
  "id": "classic-literature",
  "name": "Classic Literature",
  "bookCount": 3,
  "totalDuration": 240000,
  "authors": ["F. Scott Fitzgerald"],
  "genres": ["Fiction"],
  "books": [
    {
      "id": "507f1f77bcf86cd799439011",
      "title": "Book One",
      "series": "Classic Literature",
      "seriesIndex": 1
    }
  ]
}
```

## Endpoints

### GET /

List series discovered from books.

Query parameters:

- `q`: partial match across title, author, series, genre, and tags on member books
- `title`: partial match against member book titles
- `author`: partial match against member book authors
- `series`: partial match against series names
- `genre`: partial match against member book genres
- `language`: partial match against member book language
- `limit`: number of grouped series to return, default `20`
- `offset`: group offset, default `0`

Example:

```bash
curl "http://localhost:3000/api/series?author=fitz&genre=fiction" \
  -H "Authorization: Bearer <accessToken>"
```

Response:

```json
{
  "series": [
    {
      "id": "classic-literature",
      "name": "Classic Literature",
      "bookCount": 3,
      "totalDuration": 240000,
      "authors": ["F. Scott Fitzgerald"],
      "genres": ["Fiction"],
      "coverPath": "/data/audiobooks/507f1f77bcf86cd799439011/cover.jpg"
    }
  ],
  "total": 1
}
```

### GET /:seriesName

Get one series and its ordered books.

Notes:

- `seriesName` is matched case-insensitively against the stored book `series` field
- clients should URL-encode the series name in the path
- optional `q`, `title`, `author`, `genre`, and `language` filters can narrow the returned books within that series

Example:

```bash
curl "http://localhost:3000/api/series/Classic%20Literature" \
  -H "Authorization: Bearer <accessToken>"
```

Common errors:

- `400` `series_name_required`
- `404` `series_not_found`

## Typical Client Flow

1. Load `GET /api/series` to render app-level series shelves.
2. Use the same partial query inputs as the books screen for author, title, series, or genre filtering.
3. Open `GET /api/series/:seriesName` to render a detail view with books ordered by `seriesIndex`, then title.
4. Use [Collections API Endpoints](./collections-endpoints.md) separately for user-made lists.

## Related Docs

- [Books API Endpoints](./books-endpoints.md)
- [Collections API Endpoints](./collections-endpoints.md)
