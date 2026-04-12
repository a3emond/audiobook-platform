# Capsule 06 - Admin Module

## 1. Module Scope

- Operational supervision for users, sessions, jobs, and ingestion.
- Live visibility for queue health and processing status.
- Manual control actions for job operations.

## 2. Capability Set

- Admin dashboards for users and auth sessions.
- Job list filtering and status inspection.
- Manual job trigger and replay controls.
- Live updates via server sent events.

## 3. Architecture Flow Diagram

```mermaid
flowchart LR
    AUI[Admin UI] --> AAPI[Admin API]
    AAPI --> AUD[Audit Service]
    AAPI --> JOB[Jobs Service]
    JOB --> Q[(Queue Store)]
    JOB --> SSE[Jobs Event Stream]
    SSE --> AUI
```

## 4. Sequence Diagram

```mermaid
sequenceDiagram
    participant A as Admin UI
    participant API as Admin API
    participant J as Jobs Service
    participant Q as Queue Store

    A->>API: request job list
    API->>J: list jobs with filters
    J->>Q: read queue states
    Q-->>A: jobs snapshot
    A->>API: trigger replay for failed job
    API->>J: enqueue replay
    J-->>A: replay accepted
```

## 5. Class Diagram

```mermaid
classDiagram
    class AdminController {
      listUsers()
      listSessions()
      listJobs()
      replayJob()
    }
    class JobsService {
      getJobs()
      triggerReplay()
      streamEvents()
    }
    class AdminAuditService {
      record()
      search()
    }
    class QueueStore {
      find()
      enqueue()
      update()
    }

    AdminController --> JobsService
    AdminController --> AdminAuditService
    JobsService --> QueueStore
```

## 6. Evidence Files

- `api/src/modules/admin`
- `api/src/modules/jobs`
- `frontend/src/app/admin`
- `worker/src/queue`

## 7. Code Proof Snippets

```ts
// api/src/modules/jobs/jobs.routes.ts
router.post('/:jobId/replay', requireAdmin, jobsController.replayJob);
```

```ts
// api/src/modules/admin/admin-audit.middleware.ts
await adminAuditService.record({ actorId, action, target, metadata });
```

## 8. GoF Patterns Demonstrated

- Facade
  - What it does: exposes admin friendly operations through a single orchestration layer so UI does not call multiple domain services directly.

```ts
// api/src/modules/admin/admin.service.ts
async function getAdminOverview(filters: JobsFilters) {
  const [users, sessions, jobs] = await Promise.all([
    usersService.listRecent(),
    sessionsService.listActive(),
    jobsService.getJobs(filters),
  ]);
  return { users, sessions, jobs };
}
```

```mermaid
flowchart LR
    AUI[Admin UI] --> AF[Admin Facade]
    AF --> US[Users Service]
    AF --> SS[Sessions Service]
    AF --> JS[Jobs Service]
```

- Observer
  - What it does: streams job updates to all connected admin clients without polling.

```ts
// api/src/modules/jobs/jobs.sse.ts
jobsEvents.on('job.state.changed', (event) => {
  sseBroadcaster.publish(event);
});
```

```mermaid
flowchart LR
    QP[Queue Processor] --> EVT[(job.state.changed)]
    EVT --> SSE[Jobs SSE Stream]
    SSE --> A1[Admin Browser 1]
    SSE --> A2[Admin Browser 2]
```

- Command
  - What it does: captures replay/abort admin intents as explicit command objects with auditable metadata.

```ts
// api/src/modules/jobs/jobs.service.ts
type ReplayJobCommand = { actorId: string; jobId: string; reason: string };

async function handleReplayCommand(cmd: ReplayJobCommand) {
  await auditService.record({ action: 'replay-job', actorId: cmd.actorId, target: cmd.jobId });
  return queueStore.enqueueReplay(cmd.jobId);
}
```

```mermaid
flowchart LR
    AC[Admin Controller] --> CMD[ReplayJobCommand]
    CMD --> JH[Jobs Command Handler]
    JH --> AUD[Audit Log]
    JH --> Q[(Queue Store)]
```

<!-- screenshot: admin jobs dashboard -->
<!-- screenshot: admin user and session view -->
