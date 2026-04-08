# Auth API Endpoints (Client Guide)

This document is for client developers integrating authentication flows (web, mobile, desktop).

Base path: `/api/v1/auth`

## Quick Flows

### Email/Password Login
1. Call `POST /api/v1/auth/login`.
2. Store `accessToken` and `refreshToken`.
3. Send `Authorization: Bearer <accessToken>` for protected requests.
4. When access token expires, call `POST /api/auth/refresh`.

### Registration
1. Call `POST /api/v1/auth/register`.
2. Receive tokens immediately.
3. Use returned user payload as authenticated session.

### OAuth Login (Google/Apple)
1. Obtain provider `idToken` on client.
2. Call `POST /api/v1/auth/oauth/google` or `POST /api/v1/auth/oauth/apple`.
3. Receive platform tokens and authenticated user.

### Logout
1. Call `POST /api/v1/auth/logout` with current `refreshToken`.
2. Delete local access/refresh tokens.

### Account Security
1. Call `POST /api/v1/auth/change-password` to rotate a password-based account password.
2. Call `POST /api/v1/auth/change-email` to change the login email on a password-based account.
3. Refresh the local user state after a successful email change.

## Response Shapes

### Auth Success

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

### Token Refresh Success

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<new-opaque-token>"
}
```

### Error Shape

```json
{
  "message": "invalid_credentials"
}
```

## Endpoints

### POST /login

Authenticate with email/password.

Request:

```json
{
  "email": "user@example.com",
  "password": "plain-text-password"
}
```

Success:
- `200 OK`
- Body: Auth Success

Common errors:
- `400` `invalid_payload`
- `400` `email_and_password_required`
- `400` `invalid_email`
- `401` `invalid_credentials`
- `404` `user_not_found`

### POST /register

Create account and return tokens.

Request:

```json
{
  "email": "user@example.com",
  "password": "strong-password",
  "displayName": "Alice"
}
```

Success:
- `201 Created`
- Body: Auth Success

Common errors:
- `400` `invalid_payload`
- `400` `email_and_password_required`
- `400` `invalid_email`
- `400` `invalid_password`
- `400` `invalid_display_name`
- `409` `email_already_used`

### POST /refresh

Rotate refresh token and issue new access token.

Request:

```json
{
  "refreshToken": "<opaque-token>"
}
```

Success:
- `200 OK`
- Body: Token Refresh Success

Common errors:
- `400` `invalid_payload`
- `400` `missing_refresh_token`
- `401` `invalid_session`
- `401` `session_expired`
- `404` `user_not_found`

### POST /logout

Revoke session associated with refresh token.

Request:

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

Common errors:
- `400` `invalid_payload`
- `400` `missing_refresh_token`

### POST /oauth/google

Authenticate with Google ID token.

Request:

```json
{
  "idToken": "<google-id-token>"
}
```

Success:
- `200 OK`
- Body: Auth Success

Common errors:
- `400` `invalid_payload`
- `400` `missing_id_token`
- `401` `invalid_oauth_token`
- `404` `user_not_found`

### POST /oauth/apple

Authenticate with Apple ID token.

Request:

```json
{
  "idToken": "<apple-id-token>"
}
```

Success:
- `200 OK`
- Body: Auth Success

Common errors:
- `400` `invalid_payload`
- `400` `missing_id_token`
- `401` `invalid_oauth_token`
- `404` `user_not_found`

### GET /me

Return current authenticated user.

Headers:

```text
Authorization: Bearer <accessToken>
```

Success:
- `200 OK`
- Body: user payload

Common errors:
- `401` `missing_token`
- `401` `invalid_token`
- `404` `user_not_found`

### POST /change-password

Change the password for the current authenticated user.

Headers:

```text
Authorization: Bearer <accessToken>
```

Request:

```json
{
  "currentPassword": "old-password",
  "newPassword": "new-strong-password"
}
```

Success:
- `200 OK`

```json
{
  "success": true
}
```

Common errors:
- `400` `invalid_payload`
- `400` `current_and_new_password_required`
- `400` `invalid_new_password`
- `400` `new_password_must_differ`
- `400` `password_auth_not_available`
- `401` `invalid_credentials`

### POST /change-email

Change the login email for the current authenticated user.

Headers:

```text
Authorization: Bearer <accessToken>
```

Request:

```json
{
  "currentPassword": "current-password",
  "newEmail": "new-address@example.com"
}
```

Success:
- `200 OK`
- Body: user payload

Common errors:
- `400` `invalid_payload`
- `400` `current_password_and_new_email_required`
- `400` `invalid_email`
- `400` `email_unchanged`
- `400` `password_auth_not_available`
- `401` `invalid_credentials`
- `409` `email_already_used`

## Token Handling Guidance

- Keep access token in memory when possible.
- Keep refresh token in secure storage.
- On `401` due to expired token, call `/refresh` once, then retry original request.
- If refresh fails (`401 invalid_session` or `401 session_expired`), force full re-login.

## Related Docs

- [Auth Implementation Reference](./auth-implementation-reference.md)
- [Jobs API Endpoints](./jobs-endpoints.md)
