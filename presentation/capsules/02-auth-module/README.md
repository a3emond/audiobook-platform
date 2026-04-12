# Capsule 02 - Auth Module

## 1. Module Scope

- Identity lifecycle: signup, signin, refresh rotation, logout, session tracking.
- External identity: Google OAuth and Apple identity validation.
- Security boundaries: abuse throttling, token hashing, session revocation.

## 2. Capability Set

- Access and refresh JWT issuance.
- Refresh token rotation with persisted hashed token references.
- OAuth exchange mapped to internal user identity and session.
- Admin session visibility and cleanup hooks.

## 3. Architecture Flow Diagram

```mermaid
flowchart LR
    FE[Frontend Auth UI] --> AR[Auth Routes]
    AR --> AS[Auth Service]
    AS --> JS[JWT Service]
    AS --> SS[Session Store]
    AS --> US[User Store]
    AS --> OA[OAuth Service]
    OA --> AP[Apple Verify]
    OA --> GP[Google Verify]
```

## 4. Sequence Diagram

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant AR as Auth Routes
    participant AS as Auth Service
    participant DB as Session Store

    FE->>AR: POST signin
    AR->>AS: validate credentials
    AS->>DB: create session with hashed refresh token
    AS-->>AR: access token and refresh token
    AR-->>FE: auth response
    FE->>AR: POST refresh
    AR->>AS: rotate refresh token
    AS->>DB: replace session token hash
    AS-->>FE: new token pair
```

## 5. Class Diagram

```mermaid
classDiagram
    class AuthController {
      signin()
      refresh()
      logout()
    }
    class AuthService {
      issueTokens()
      rotateSession()
      revokeSession()
    }
    class JwtService {
      signAccess()
      signRefresh()
      verify()
    }
    class OAuthService {
      googleAuth()
      appleAuth()
    }
    class AuthSessionModel {
      userId
      refreshTokenHash
      expiresAt
    }

    AuthController --> AuthService
    AuthService --> JwtService
    AuthService --> OAuthService
    AuthService --> AuthSessionModel
```

## 6. Evidence Files

- `api/src/modules/auth/auth.routes.ts`
- `api/src/modules/auth/auth.service.ts`
- `api/src/modules/auth/oauth.service.ts`
- `api/src/modules/auth/session.model.ts`
- `api/src/modules/auth/jwt.ts`

## 7. Code Proof Snippets

```ts
// api/src/modules/auth/auth.service.ts
const refreshTokenHash = await hashRefreshToken(rawRefreshToken);
await AuthSessionModel.create({ userId, refreshTokenHash, expiresAt });
```

```ts
// api/src/modules/auth/oauth.service.ts
const applePayload = await verifyAppleIdentityToken(identityToken);
const googleProfile = await verifyGoogleIdToken(idToken);
```

## 8. GoF Patterns Demonstrated

- Strategy
  - What it does: encapsulates provider specific verification behind one contract so auth flows can switch between Apple and Google without changing route/controller code.

```ts
// api/src/modules/auth/oauth.service.ts
interface OAuthVerifier {
  verify(idToken: string): Promise<{ email: string; providerUserId: string }>;
}

class GoogleVerifier implements OAuthVerifier {
  async verify(idToken: string) {
    return verifyGoogleIdToken(idToken);
  }
}

class AppleVerifier implements OAuthVerifier {
  async verify(idToken: string) {
    return verifyAppleIdentityToken(idToken);
  }
}
```

```mermaid
flowchart LR
    AR[Auth Routes] --> OS[OAuth Service]
    OS -->|provider=google| GV[GoogleVerifier]
    OS -->|provider=apple| AV[AppleVerifier]
    GV --> US[User Mapping + Session]
    AV --> US
```

- Factory Method
  - What it does: centralizes token creation rules so access and refresh tokens are generated consistently per auth mode.

```ts
// api/src/modules/auth/auth.service.ts
function createTokenPair(userId: string, mode: 'password' | 'oauth') {
  const access = jwtService.signAccess({ sub: userId, mode });
  const refresh = jwtService.signRefresh({ sub: userId, mode });
  return { access, refresh };
}
```

```mermaid
flowchart LR
    AS[Auth Service] --> FM[createTokenPair]
    FM --> AT[Access Token]
    FM --> RT[Refresh Token]
    AT --> RESP[Auth Response]
    RT --> RESP
```

- Facade
  - What it does: offers one entry point (`AuthService`) over JWT signing, session persistence, and user lookup to keep controller logic thin.

```ts
// api/src/modules/auth/auth.service.ts
async function signin(email: string, password: string) {
  const user = await userStore.verifyCredentials(email, password);
  const tokens = createTokenPair(user.id, 'password');
  await sessionStore.save(user.id, tokens.refresh);
  return { user, tokens };
}
```

```mermaid
flowchart LR
    AC[Auth Controller] --> AF[AuthService Facade]
    AF --> JS[JWT Service]
    AF --> SS[Session Store]
    AF --> US[User Store]
```

<!-- screenshot: signin page -->
<!-- screenshot: session list in admin -->
