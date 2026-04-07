# Settings API Endpoints

This document is for client developers consuming user settings APIs.

Base path: `/api/settings`

Authentication: required on all endpoints.

```text
Authorization: Bearer <accessToken>
```

## Overview

Settings are user-scoped and automatically initialized on first access.

Current capabilities:
- get current user settings
- partially update player, locale, and library preferences

## Data Shape

### Settings Object

```json
{
  "locale": "en",
  "player": {
    "forwardJumpSeconds": 30,
    "backwardJumpSeconds": 10,
    "resumeRewind": {
      "enabled": true,
      "thresholdSinceLastListenSeconds": 86400,
      "rewindSeconds": 10
    },
    "playbackRate": 1,
    "autoMarkCompletedThresholdSeconds": 20
  },
  "library": {
    "sortBy": "recent",
    "sortDirection": "desc",
    "showCompleted": true
  }
}
```

## Endpoints

### GET /

Get settings for the authenticated user.

Behavior:
- creates a default settings document if one does not already exist

Example:

```bash
curl "http://localhost:3000/api/settings" \
  -H "Authorization: Bearer <accessToken>"
```

Common errors:
- `401` `missing_token`
- `401` `invalid_token`

### PATCH /

Partially update settings for the authenticated user.

Request body:

```json
{
  "locale": "fr",
  "player": {
    "forwardJumpSeconds": 15,
    "backwardJumpSeconds": 10,
    "resumeRewind": {
      "enabled": true,
      "thresholdSinceLastListenSeconds": 43200,
      "rewindSeconds": 10
    },
    "playbackRate": 1.25,
    "autoMarkCompletedThresholdSeconds": 20
  },
  "library": {
    "sortBy": "title",
    "sortDirection": "asc",
    "showCompleted": false
  }
}
```

Behavior:
- accepts partial nested updates
- validates locale against supported values: `en`, `fr`
- validates jump values against the allowed set: `5`, `10`, `15`, `20`, `25`, `30`
- validates `playbackRate` in the inclusive range `0.5` to `3`
- validates library sorting fields and direction

Common errors:
- `400` `settings_invalid_locale`
- `400` `settings_invalid_forward_jump`
- `400` `settings_invalid_backward_jump`
- `400` `settings_invalid_resume_rewind_jump`
- `400` `settings_invalid_playback_rate`
- `400` `settings_invalid_completion_threshold`
- `400` `settings_invalid_resume_threshold`
- `400` `settings_invalid_sort_by`
- `400` `settings_invalid_sort_direction`

## Typical Client Flow

1. Load `GET /api/settings` during app bootstrap after authentication.
2. Keep the returned object as the local preference source of truth.
3. Send `PATCH /api/settings` when the user changes player or library preferences.
4. Replace local cached settings with the response body after each successful update.

## Related Docs

- [Auth API Endpoints (Client Guide)](./auth-endpoints.md)
- [Progress API Endpoints](./progress-endpoints.md)