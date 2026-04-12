# Capsule 07 - Reliability Module

## 1. Module Scope

- Cross cutting reliability controls applied to API and worker execution.
- Request safety, abuse control, and traceability.
- Failure recovery and operational resilience.

## 2. Capability Set

- Idempotency middleware for replay safe write requests.
- Rate limiting for abusive request bursts.
- Admin audit trail for sensitive operations.
- Worker retry policy with stale lock reclaim.

## 3. Architecture Flow Diagram

```mermaid
flowchart LR
    REQ[Incoming Request] --> RL[Rate Limit Middleware]
    RL --> IDP[Idempotency Middleware]
    IDP --> APP[Domain Handlers]
    APP --> AUD[Audit Service]
    APP --> DB[(MongoDB)]
    WRK[Worker Loop] --> RP[Retry Policy]
    RP --> DB
```

## 4. Sequence Diagram

```mermaid
sequenceDiagram
    participant C as Client
    participant M as Middleware Chain
    participant H as Handler
    participant A as Audit

    C->>M: POST mutable action with idempotency key
    M->>M: apply rate limit and key check
    M->>H: forward once
    H->>A: record admin sensitive action
    H-->>C: success response
    C->>M: retry same key
    M-->>C: replay safe response
```

## 5. Class Diagram

```mermaid
classDiagram
    class IdempotencyMiddleware {
      handle()
    }
    class RateLimitMiddleware {
      handle()
    }
    class AdminAuditModel {
      actorId
      action
      timestamp
    }
    class RetryPolicy {
      nextDelayMs()
      shouldRetry()
    }

    IdempotencyMiddleware --> AdminAuditModel
    RetryPolicy --> AdminAuditModel
```

## 6. Evidence Files

- `api/src/middlewares/idempotency.middleware.ts`
- `api/src/middlewares/rate-limit.middleware.ts`
- `api/src/modules/admin/admin-audit.model.ts`
- `worker/src/queue/retry-policy.ts`
- `worker/src/queue/processor.ts`

## 7. Code Proof Snippets

```ts
// api/src/middlewares/idempotency.middleware.ts
if (cachedResponse) {
  return res.status(cachedResponse.status).json(cachedResponse.body);
}
```

```ts
// worker/src/queue/retry-policy.ts
const delayMs = Math.min(baseDelayMs * 2 ** attempts, maxDelayMs);
```

## 8. GoF Patterns Demonstrated

- Chain of Responsibility
  - What it does: composes reliability concerns in order (rate limit -> idempotency -> domain handler) so each step can short circuit safely.

```ts
// api/src/app.ts
app.use(rateLimitMiddleware);
app.use(idempotencyMiddleware);
app.use('/api', apiRouter);
```

```mermaid
flowchart LR
    REQ[Request] --> RL[RateLimitMiddleware]
    RL --> IDP[IdempotencyMiddleware]
    IDP --> H[Domain Handler]
    H --> RESP[Response]
```

- Strategy
  - What it does: separates policy from execution so retry and throttling behavior can evolve independently from business handlers.

```ts
// worker/src/queue/retry-policy.ts
interface RetryPolicy {
  shouldRetry(attempts: number): boolean;
  nextDelayMs(attempts: number): number;
}

const boundedExponentialPolicy: RetryPolicy = {
  shouldRetry: (attempts) => attempts < 5,
  nextDelayMs: (attempts) => Math.min(1000 * 2 ** attempts, 30_000),
};
```

```mermaid
flowchart LR
    PROC[Queue Processor] --> POL[RetryPolicy Strategy]
    POL --> DEC[retry decision + delay]
    DEC --> STORE[Queue Store update]
```

- Singleton
  - What it does: uses shared limiter/cache instances to keep request accounting coherent across middleware calls in a process.

```ts
// api/src/middlewares/rate-limit.middleware.ts
const limiter = createTokenBucketLimiter({ capacity: 60, refillPerMin: 60 });

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!limiter.tryConsume(req.ip)) {
    return res.status(429).json({ message: 'Too many requests' });
  }
  return next();
}
```

```mermaid
flowchart LR
    M1[RateLimitMiddleware Call] --> LIM[(Shared Limiter Singleton)]
    M2[RateLimitMiddleware Call] --> LIM
    LIM --> DEC2[allow or reject]
```

<!-- screenshot: rate limit and abuse monitor -->
<!-- screenshot: audit timeline table -->
