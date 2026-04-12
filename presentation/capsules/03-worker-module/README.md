# Capsule 03 - Worker Module

## 1. Module Scope

- Media ingestion and transformation pipeline.
- Queue lanes, locking, retries, and stale lock recovery.
- Status propagation to API and admin supervision.

## 2. Capability Set

- Job enqueue from API.
- Lane based execution with polling loop.
- FFmpeg integration for metadata, cover, and chapter packaging.
- Retry policy and dead failure visibility.

## 3. Architecture Flow Diagram

```mermaid
flowchart LR
    API[API Jobs Routes] --> Q[Queue Store]
    Q --> R[Queue Runner]
    R --> P[Queue Processor]
    P --> J[Ingest Job Handler]
    J --> FF[FFmpeg Scripts]
    P --> Q
```

## 4. Sequence Diagram

```mermaid
sequenceDiagram
    participant API as API
    participant Q as Queue Store
    participant R as Runner
    participant H as Ingest Handler

    API->>Q: enqueue ingest job
    R->>Q: claim next pending job
    Q-->>R: job payload
    R->>H: process payload
    H-->>R: success or failure
    R->>Q: update status and attempts
    Q-->>API: status visible for admin
```

## 5. Class Diagram

```mermaid
classDiagram
    class QueueRunner {
      start()
      tick()
    }
    class QueueProcessor {
      claim()
      execute()
      release()
    }
    class IngestJob {
      run()
      extractMetadata()
      packageM4B()
    }
    class QueueStore {
      enqueue()
      markRunning()
      markDone()
      markFailed()
    }

    QueueRunner --> QueueProcessor
    QueueProcessor --> QueueStore
    QueueProcessor --> IngestJob
```

## 6. Evidence Files

- `worker/src/queue/runner.ts`
- `worker/src/queue/processor.ts`
- `worker/src/jobs/ingest-mp3-as-m4b.job.ts`
- `worker/src/queue/retry-policy.ts`
- `ffmpeg/scripts/extract-metadata.sh`

## 7. Code Proof Snippets

```ts
// worker/src/queue/processor.ts
if (job.attempts < retryPolicy.maxAttempts) {
  await queueStore.reschedule(job.id, retryPolicy.nextDelayMs(job.attempts));
}
```

```ts
// worker/src/jobs/ingest-mp3-as-m4b.job.ts
await writeChapters(tempMetaPath, chapterList);
await packageM4B(sourceDir, outputFile, tempMetaPath);
```

## 8. GoF Patterns Demonstrated

- Template Method
  - What it does: defines a stable job execution skeleton (claim -> execute -> finalize) while each job handler provides specialized transformation logic.

```ts
// worker/src/queue/processor.ts
async function runClaimedJob(job: Job) {
  await markRunning(job);
  try {
    await handlerRegistry.get(job.type).run(job.payload); // variable step
    await markDone(job);
  } catch (error) {
    await markFailure(job, error);
  }
}
```

```mermaid
flowchart LR
    QP[QueueProcessor Template] --> C1[markRunning]
    C1 --> C2[handler.run(payload)]
    C2 --> C3[markDone or markFailure]
```

- Strategy
  - What it does: swaps retry and lane policies without changing queue processor flow, which keeps resilience tuning isolated.

```ts
// worker/src/queue/retry-policy.ts
interface RetryStrategy {
  nextDelayMs(attempts: number): number;
  shouldRetry(attempts: number): boolean;
}

const exponentialRetry: RetryStrategy = {
  nextDelayMs: (attempts) => Math.min(1000 * 2 ** attempts, 60_000),
  shouldRetry: (attempts) => attempts < 5,
};
```

```mermaid
flowchart LR
    QP[QueueProcessor] --> RS[RetryStrategy]
    RS --> DLY[delay + retry decision]
    DLY --> QS[QueueStore reschedule]
```

- Observer
  - What it does: publishes job state transitions that admin and API consumers subscribe to for live status.

```ts
// worker/src/queue/processor.ts
eventBus.emit('job.state.changed', {
  jobId: job.id,
  status: 'failed',
  attempts: job.attempts,
});
```

```mermaid
flowchart LR
    WP[Worker Processor] --> EV[(Event Bus)]
    EV --> API[API Jobs Stream]
    API --> AUI[Admin UI]
```

<!-- screenshot: job list with states -->
<!-- screenshot: live worker logs -->
