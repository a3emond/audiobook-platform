# Authentication API Technical Documentation

## 1. Purpose

This document defines the Auth API contract for client applications (web, mobile, desktop).

Implemented capabilities:

- Email/password registration
- Email/password login
- OAuth login with Google and Apple
- JWT access token issuance
- Refresh-token session rotation
- Session revocation (logout)
- Current authenticated user retrieval

Current API base path: `/api/auth`

## 2. Environment And Runtime Requirements

Required server environment variables:

- `JWT_SECRET`
- `MONGO_URI`
- `GOOGLE_CLIENT_ID`
- `APPLE_CLIENT_ID`

Optional auth-related variables:

- `JWT_EXPIRES_IN` (default: `12h` inside auth JWT service)
- `REFRESH_TOKEN_DAYS` (default: `60`)
- `BCRYPT_ROUNDS` (default: `10`)

Notes:

- OAuth env vars are required at module load time.
- If OAuth env vars are missing, API startup fails.

## 3. Authentication Model

### 3.1 Access Token

- Format: JWT
- Signed with: `JWT_SECRET`
- Claims:
  - `sub`: user id
  - `role`: `admin | user`
- Default TTL: `12h` (configurable via `JWT_EXPIRES_IN`)
- Usage: `Authorization: Bearer <accessToken>`

### 3.2 Refresh Token

- Format: opaque random token (`base64url`)
- Generated with crypto random bytes
- Server stores only SHA-256 hash (`tokenHash`)
- Rotated on every successful refresh
- Session TTL default: `60 days` (sliding window)

## 4. Response Shapes

### 4.1 Token Payload

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<opaque-token>"
}
```

### 4.2 User Payload

```json
{
  "id": "string",
  "email": "user@example.com",
  "role": "user",
  "profile": {
    "displayName": "Alice",
    "preferredLocale": "fr"
  },
  "createdAt": "2026-01-01T10:00:00.000Z",
  "updatedAt": "2026-01-01T10:00:00.000Z"
}
```

### 4.3 Login/OAuth Success Payload

```json
{
  "tokens": {
    "accessToken": "<jwt>",
    "refreshToken": "<opaque-token>"
  },
  "user": {
    "id": "string",
    "email": "user@example.com",
    "role": "user",
    "profile": {
      "displayName": "Alice",
      "preferredLocale": "fr"
    },
    "createdAt": "2026-01-01T10:00:00.000Z",
    "updatedAt": "2026-01-01T10:00:00.000Z"
  }
}
```

### 4.4 Error Payload

```json
{
  "message": "invalid_credentials"
}
```

## 5. Endpoints

### 5.1 POST /api/auth/login

Authenticate with email/password.

Request body:

```json
{
  "email": "user@example.com",
  "password": "plain-text-password"
}
```

Success:

- `200 OK`
- Response: Login/OAuth Success Payload

Possible errors:

- `400` `invalid_payload`
- `400` `email_and_password_required`
- `400` `invalid_email`
- `401` `invalid_credentials`
- `404` `user_not_found`

### 5.2 POST /api/auth/register

Register with email/password and immediately create session tokens.

Request body:

```json
{
  "email": "user@example.com",
  "password": "strong-password",
  "displayName": "Alice"
}
```

Success:

- `201 Created`
- Response: Login/OAuth Success Payload

Possible errors:

- `400` `invalid_payload`
- `400` `email_and_password_required`
- `400` `invalid_email`
- `400` `invalid_password`
- `400` `invalid_display_name`
- `409` `email_already_used`

### 5.3 POST /api/auth/refresh

Rotate refresh token and issue new access token.

Request body:

```json
{
  "refreshToken": "<opaque-token>"
}
```

Success:

- `200 OK`
- Response:

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<new-opaque-token>"
}
```

Possible errors:

- `400` `invalid_payload`
- `400` `missing_refresh_token`
- `401` `invalid_session`
- `401` `session_expired`
- `404` `user_not_found`

### 5.4 POST /api/auth/logout

Revoke session identified by refresh token.

Request body:

```json
{
  "refreshToken": "<opaque-token>"
}
```

Success:

- `200 OK`

```json
{
  "success": true
}
```

Possible errors:

- `400` `invalid_payload`
- `400` `missing_refresh_token`

Notes:

- Endpoint is idempotent from client perspective.
- If session does not exist, response is still success.

### 5.5 POST /api/auth/oauth/google

Login/signup with Google ID token.

Request body:

```json
{
  "idToken": "<google-id-token>"
}
```

Success:

- `200 OK`
- Response: Login/OAuth Success Payload

Possible errors:

- `400` `invalid_payload`
- `400` `missing_id_token`
- `401` `invalid_oauth_token`
- `404` `user_not_found`

### 5.6 POST /api/auth/oauth/apple

Login/signup with Apple ID token.

Request body:

```json
{
  "idToken": "<apple-id-token>"
}
```

Success:

- `200 OK`
- Response: Login/OAuth Success Payload

Possible errors:

- `400` `invalid_payload`
- `400` `missing_id_token`
- `401` `invalid_oauth_token`
- `404` `user_not_found`

### 5.7 GET /api/auth/me

Retrieve the authenticated user profile.

Headers:

```text
Authorization: Bearer <accessToken>
```

Success:

- `200 OK`
- Response: User Payload

Possible errors:

- `401` `missing_token`
- `401` `invalid_token`
- `404` `user_not_found`

## 6. OAuth Account Resolution Rules

When receiving a validated OAuth profile:

1. Find auth record by provider identity (`provider`, `providerId`)
2. Else find auth record by email (or generated fallback email)
3. Else create new user + auth record

Fallback email when provider email is unavailable:

```text
<providerId>@<provider>.local
```

## 7. Client Integration Guidance

### 7.1 Token Storage

- Keep access token in memory where possible.
- Store refresh token in secure storage suitable for platform.
- Never log tokens in production telemetry.

### 7.2 Refresh Strategy

- On `401 invalid_token` from protected APIs, call `/api/auth/refresh` once.
- Replace both access token and refresh token with returned values.
- Retry original request after successful refresh.
- If refresh fails with `invalid_session` or `session_expired`, force sign-out.

### 7.3 Logout Strategy

- Call `/api/auth/logout` with latest refresh token.
- Always clear local tokens regardless of response.

## 8. Security Characteristics

- Access token verification uses JWT signature and expiration.
- Google verification validates token against configured audience.
- Apple verification validates signature, audience, issuer, algorithm.
- Refresh tokens are never stored in clear text on server.
- Session collection has TTL index on `expiresAt`.

## 9. Known Contract Gaps In Current Implementation

These points are important for client teams and backend maintainers:

- Session metadata fields (`device`, `ip`, `userAgent`) exist in model but are not filled by service.

## 10. Quick Reference Table

| Method | Path                    | Auth Header Required | Description |
| ------ | ----------------------- | -------------------- | ----------- |
| POST   | /api/auth/register      | No                   | Password registration |
| POST   | /api/auth/login         | No                   | Password login |
| POST   | /api/auth/refresh       | No                   | Rotate tokens |
| POST   | /api/auth/logout        | No                   | Revoke refresh session |
| POST   | /api/auth/oauth/google  | No                   | OAuth Google login/signup |
| POST   | /api/auth/oauth/apple   | No                   | OAuth Apple login/signup |
| GET    | /api/auth/me            | Yes                  | Current authenticated user |

## 11. Changelog Guidance

When backend changes auth behavior, update this document for:

- New/removed endpoints
- Request or response field changes
- Error code/message changes
- Token lifetime defaults
- OAuth provider requirements
