# Users API Endpoints

This document is for client developers consuming user profile APIs.

Base path: `/api/users`

Authentication: required on all endpoints.

```text
Authorization: Bearer <accessToken>
```

## Overview

User endpoints are scoped to the authenticated user.

Current capabilities:
- fetch current profile
- update editable profile preferences

## Endpoints

### GET /me

Get the current user profile.

Response:

```json
{
  "id": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "role": "user",
  "profile": {
    "displayName": "Alice",
    "preferredLocale": "en"
  },
  "createdAt": "2026-04-07T10:00:00.000Z",
  "updatedAt": "2026-04-07T10:10:00.000Z"
}
```

Common errors:
- `401` `missing_token`
- `404` `user_not_found`

### PATCH /me

Partially update current user profile settings.

Request body:

```json
{
  "profile": {
    "displayName": "Alice",
    "preferredLocale": "fr"
  }
}
```

Behavior:
- accepts partial nested updates
- `displayName` can be set to `null` to clear it
- validates `preferredLocale` in `en | fr`

Common errors:
- `400` `user_empty_update`
- `400` `user_invalid_display_name`
- `400` `user_invalid_preferred_locale`
- `404` `user_not_found`

## Related Docs

- [Auth API Endpoints (Client Guide)](./auth-endpoints.md)
- [Settings API Endpoints](./settings-endpoints.md)