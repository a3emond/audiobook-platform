# Job Queue API — Endpoint Reference

## Overview

The Job Queue API allows clients to enqueue long-running background tasks and monitor their execution. All job operations are performed asynchronously through the worker service.

## Base URL

```
/api/v1/admin/jobs
```

Backward-compatible alias: `/api/admin/jobs`

## Authentication

All job queue endpoints require:
- valid bearer access token
- `admin` role

Non-admin users receive `403 forbidden`.

For a complete admin route inventory, see [Admin API Endpoints](./admin-endpoints.md).

---

## Endpoints

### Enqueue Job

**POST** `/api/admin/jobs/enqueue`

Create and queue a new background job.

Idempotency:
- Supported via `Idempotency-Key` request header.
- Replays the prior successful response for retries with the same key and identical payload.

#### Request

```json
{
  "type": "INGEST",
  "payload": {
    "sourcePath": "/uploads/audiobook.m4b"
  },
  "maxAttempts": 3
}
```

**Parameters**:
- `type` (string, required): Job type. One of: `INGEST`, `RESCAN`, `WRITE_METADATA`, `EXTRACT_COVER`, `DELETE_BOOK`, `REPLACE_FILE`
- `payload` (object, required): Job-specific data. Structure depends on job type.
- `maxAttempts` (number, optional): Max retry attempts. Default: 3. Min: 1.

#### Response

**Status**: 201 Created

```json
{
  "id": "507f1f77bcf86cd799439011",
  "type": "INGEST",
  "status": "queued",
  "payload": {
    "sourcePath": "/uploads/audiobook.m4b"
  },
  "output": null,
  "error": null,
  "attempt": 0,
  "maxAttempts": 3,
  "runAfter": "2026-04-06T10:30:00Z",
  "createdAt": "2026-04-06T10:30:00Z",
  "updatedAt": "2026-04-06T10:30:00Z",
  "startedAt": null,
  "finishedAt": null
}
```

#### Error Responses

```json
// 400 Bad Request - Invalid job type
{
  "message": "job_invalid_type"
}

// 400 Bad Request - Invalid payload
{
  "message": "job_invalid_payload"
}

// 400 Bad Request - Invalid maxAttempts
{
  "message": "job_invalid_max_attempts"
}
```

---

### Get Job Status

**GET** `/api/admin/jobs/:jobId`

Retrieve the current status and details of a specific job.

#### Request

```
GET /api/admin/jobs/507f1f77bcf86cd799439011
```

#### Response

**Status**: 200 OK

```json
{
  "id": "507f1f77bcf86cd799439011",
  "type": "INGEST",
  "status": "done",
  "payload": {
    "sourcePath": "/uploads/audiobook.m4b"
  },
  "output": {
    "bookId": "507f1f77bcf86cd799439099",
    "filePath": "/data/audiobooks/507f1f77bcf86cd799439099/audio.m4b",
    "coverPath": "/data/audiobooks/507f1f77bcf86cd799439099/cover.jpg",
    "checksum": "sha256:a1b2c3d4e5f6...",
    "duration": 86400,
    "chapters": 42
  },
  "error": null,
  "attempt": 1,
  "maxAttempts": 3,
  "runAfter": "2026-04-06T10:30:00Z",
  "createdAt": "2026-04-06T10:30:00Z",
  "updatedAt": "2026-04-06T10:30:15Z",
  "startedAt": "2026-04-06T10:30:05Z",
  "finishedAt": "2026-04-06T10:30:15Z"
}
```

#### Status Values

- `queued`: Job waiting to be processed
- `running`: Job currently executing
- `retrying`: Job failed and scheduled for retry
- `done`: Job completed successfully
- `failed`: Job failed permanently (max retries exceeded)

### Output Field

- `output` is `null` while queued/running/retrying or when a job failed.
- `output` is populated when `status = done`.
- The payload structure depends on job type.

### Output Schemas By Job Type

#### INGEST output

```json
{
  "bookId": "507f1f77bcf86cd799439099",
  "filePath": "/data/audiobooks/507f1f77bcf86cd799439099/audio.m4b",
  "coverPath": "/data/audiobooks/507f1f77bcf86cd799439099/cover.jpg",
  "checksum": "sha256:a1b2c3d4e5f6...",
  "duration": 86400,
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "chapters": 42
}
```

#### RESCAN output

```json
{
  "force": false,
  "targetCount": 27,
  "scanned": 27,
  "updated": 25,
  "missing": 1,
  "errors": 1
}
```

#### WRITE_METADATA output

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "filePath": "/data/audiobooks/507f1f77bcf86cd799439011/audio.m4b",
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "series": "Classic Literature",
  "genre": "Audiobook",
  "chapters": 42
}
```

#### EXTRACT_COVER output

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "coverPath": "/data/audiobooks/507f1f77bcf86cd799439011/cover.jpg",
  "skipped": false
}
```

Skipped case:

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "coverPath": "/data/audiobooks/507f1f77bcf86cd799439011/cover.jpg",
  "skipped": true,
  "reason": "cover_already_exists"
}
```

#### DELETE_BOOK output

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "deleted": true,
  "filesDeleted": true
}
```

#### REPLACE_FILE output

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "filePath": "/data/audiobooks/507f1f77bcf86cd799439011/audio.m4b",
  "sourcePath": "/uploads/new-file.m4b",
  "checksum": "sha256:4f4ddf9c...",
  "duration": 87211,
  "chapters": 44,
  "coverPath": "/data/audiobooks/507f1f77bcf86cd799439011/cover.jpg"
}
```

### TypeScript Client Narrowing

When using TypeScript on the client, treat `type` as the discriminator key for `output`.

```ts
type JobType =
  | "INGEST"
  | "RESCAN"
  | "WRITE_METADATA"
  | "EXTRACT_COVER"
  | "DELETE_BOOK"
  | "REPLACE_FILE";

type JobOutputByType = {
  INGEST: {
    bookId: string;
    filePath: string;
    coverPath: string | null;
    checksum: string;
    duration: number;
    title: string;
    author: string;
    chapters: number;
  };
  RESCAN: {
    force: boolean;
    targetCount: number;
    scanned: number;
    updated: number;
    missing: number;
    errors: number;
  };
  WRITE_METADATA: {
    bookId: string;
    filePath: string;
    title: string;
    author: string;
    series: string | null;
    genre: string | null;
    chapters: number;
  };
  EXTRACT_COVER: {
    bookId: string;
    coverPath: string | null;
    skipped: boolean;
    reason?: string;
  };
  DELETE_BOOK: {
    bookId: string;
    deleted: boolean;
    filesDeleted: boolean;
  };
  REPLACE_FILE: {
    bookId: string;
    filePath: string;
    sourcePath: string;
    checksum: string;
    duration: number;
    chapters: number;
    coverPath: string | null;
  };
};

type JobDTO<T extends JobType = JobType> = {
  id: string;
  type: T;
  status: "queued" | "running" | "retrying" | "done" | "failed";
  payload: unknown;
  output: JobOutputByType[T] | null;
};

function isDone<T extends JobType>(job: JobDTO<T>): job is JobDTO<T> & { output: JobOutputByType[T] } {
  return job.status === "done" && job.output !== null;
}

async function handleJob(jobId: string) {
  const job = (await fetch(`/api/admin/jobs/${jobId}`).then(r => r.json())) as JobDTO;

  if (job.type === "INGEST" && isDone(job)) {
    // output is strongly typed as JobOutputByType["INGEST"]
    console.log(job.output.bookId, job.output.duration, job.output.chapters);
  }
}
```

#### Error Responses

```json
// 404 Not Found - Job doesn't exist
{
  "message": "job_not_found"
}

// 400 Bad Request - Missing jobId
{
  "message": "job_id_required"
}
```

---

### List Jobs

**GET** `/api/admin/jobs`

List jobs with optional filtering and pagination.

#### Request

```
GET /api/admin/jobs?status=running&type=INGEST&limit=20&offset=0
```

**Query Parameters**:
- `status` (string, optional): Filter by status. One of: `queued`, `running`, `retrying`, `done`, `failed`
- `type` (string, optional): Filter by job type. One of: `INGEST`, `RESCAN`, `WRITE_METADATA`, `EXTRACT_COVER`, `DELETE_BOOK`, `REPLACE_FILE`
- `limit` (number, optional): Results per page. Default: 20. Max: 100.
- `offset` (number, optional): Pagination offset. Default: 0. Min: 0.

#### Response

**Status**: 200 OK

```json
{
  "jobs": [
    {
      "id": "507f1f77bcf86cd799439011",
      "type": "INGEST",
      "status": "done",
      "payload": { "sourcePath": "/uploads/book1.m4b" },
      "output": {
        "bookId": "507f1f77bcf86cd799439099",
        "filePath": "/data/audiobooks/507f1f77bcf86cd799439099/audio.m4b",
        "duration": 86400,
        "chapters": 42
      },
      "error": null,
      "attempt": 1,
      "maxAttempts": 3,
      "runAfter": "2026-04-06T10:30:00Z",
      "createdAt": "2026-04-06T10:30:00Z",
      "updatedAt": "2026-04-06T10:30:15Z",
      "startedAt": "2026-04-06T10:30:05Z",
      "finishedAt": "2026-04-06T10:30:15Z"
    },
    {
      "id": "507f1f77bcf86cd799439012",
      "type": "INGEST",
      "status": "running",
      "payload": { "sourcePath": "/uploads/book2.m4b" },
      "output": null,
      "error": null,
      "attempt": 1,
      "maxAttempts": 3,
      "runAfter": "2026-04-06T10:31:00Z",
      "createdAt": "2026-04-06T10:31:00Z",
      "updatedAt": "2026-04-06T10:31:10Z",
      "startedAt": "2026-04-06T10:31:05Z",
      "finishedAt": null
    }
  ],
  "total": 2,
  "limit": 20,
  "offset": 0,
  "hasMore": false
}
```

#### Error Responses

```json
// 400 Bad Request - Invalid status filter
{
  "message": "job_invalid_status_filter"
}

// 400 Bad Request - Invalid type filter
{
  "message": "job_invalid_type_filter"
}

// 400 Bad Request - Invalid limit
{
  "message": "job_invalid_limit"
}

// 400 Bad Request - Invalid offset
{
  "message": "job_invalid_offset"
}
```

---

### Stream Job Events (SSE)

**GET** `/api/admin/jobs/events`

Stream job updates using Server-Sent Events to reduce dashboard polling load.

Optional query parameters:
- `since` (ISO date-time, optional): only stream jobs updated after this timestamp.

#### Request

```http
GET /api/admin/jobs/events?since=2026-04-07T10:00:00.000Z
Accept: text/event-stream
```

#### Event Types

- `jobs`: batch of updated jobs
- `heartbeat`: keep-alive event when no updates are available

#### Example Event Payload

```text
event: jobs
data: {"jobs":[{"id":"507f1f77bcf86cd799439011","status":"running"}]}
```

---

### Get Job Queue Statistics

**GET** `/api/admin/jobs/stats`

Get aggregated statistics about the job queue.

#### Request

```
GET /api/admin/jobs/stats
```

#### Response

**Status**: 200 OK

```json
{
  "queued": 5,
  "running": 2,
  "retrying": 1,
  "done": 42,
  "failed": 3,
  "total": 53
}
```

---

### Cancel Job

**DELETE** `/api/admin/jobs/:jobId`

Cancel a queued job (only works if job hasn't started yet).

#### Request

```
DELETE /api/admin/jobs/507f1f77bcf86cd799439011
```

#### Response

**Status**: 200 OK

```json
{
  "id": "507f1f77bcf86cd799439011",
  "type": "INGEST",
  "status": "failed",
  "payload": { "sourcePath": "/uploads/audiobook.m4b" },
  "output": null,
  "error": {
    "code": "job_cancelled_by_user",
    "timestamp": "2026-04-06T10:32:00Z"
  },
  "attempt": 0,
  "maxAttempts": 3,
  "runAfter": "2026-04-06T10:30:00Z",
  "createdAt": "2026-04-06T10:30:00Z",
  "updatedAt": "2026-04-06T10:32:00Z",
  "startedAt": null,
  "finishedAt": "2026-04-06T10:32:00Z"
}
```

#### Error Responses

```json
// 404 Not Found - Job doesn't exist
{
  "message": "job_not_found"
}

// 400 Bad Request - Can't cancel non-queued job
{
  "message": "job_cannot_cancel_non_queued"
}

// 400 Bad Request - Missing jobId
{
  "message": "job_id_required"
}
```

---

## Job Types & Payloads

### INGEST

Upload and process a new audiobook file.

**Payload**:
```json
{
  "sourcePath": "/path/to/audiobook.m4b"
}
```

**Description**: Probes the file, extracts metadata and chapters, computes checksum, and creates a book record.

---

### WRITE_METADATA

Update chapter metadata in an existing book file.

**Payload**:
```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "chapters": [
    {
      "title": "Chapter 1: Introduction",
      "startMs": 0,
      "endMs": 300000
    },
    {
      "title": "Chapter 2: Plot",
      "startMs": 300000,
      "endMs": 600000
    }
  ]
}
```

---

### EXTRACT_COVER

Extract and save cover art from audiobook file.

**Payload**:
```json
{
  "bookId": "507f1f77bcf86cd799439011"
}
```

---

### DELETE_BOOK

Delete a book and all associated files.

**Payload**:
```json
{
  "bookId": "507f1f77bcf86cd799439011"
}
```

---

### REPLACE_FILE

Replace the audio file for an existing book.

**Payload**:
```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "sourcePath": "/path/to/new_audiobook.m4b"
}
```

---

### RESCAN

Scan the audiobooks directory for new files and ingest them.

**Payload**:
```json
{
  "force": false
}
```

---

## Usage Examples

### Example 1: Enqueue an audiobook ingest job

```bash
curl -X POST http://localhost:3000/api/admin/jobs/enqueue \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INGEST",
    "payload": {
      "sourcePath": "/uploads/great-gatsby.m4b"
    },
    "maxAttempts": 5
  }'
```

Response:
```json
{
  "id": "507f1f77bcf86cd799439011",
  "type": "INGEST",
  "status": "queued",
  "payload": { "sourcePath": "/uploads/great-gatsby.m4b" },
  "attempt": 0,
  "maxAttempts": 5,
  "createdAt": "2026-04-06T10:30:00Z"
}
```

### Example 2: Poll job status

```bash
# Poll every 2 seconds until job completes
JOB_ID="507f1f77bcf86cd799439011"

while true; do
  curl -s http://localhost:3000/api/admin/jobs/$JOB_ID | jq '.status'
  sleep 2
done
```

### Example 3: List all failed jobs

```bash
curl "http://localhost:3000/api/admin/jobs?status=failed&limit=50" | jq '.jobs'
```

### Example 4: Get queue statistics

```bash
curl http://localhost:3000/api/admin/jobs/stats | jq '.'
```

Output:
```json
{
  "queued": 2,
  "running": 1,
  "retrying": 0,
  "done": 15,
  "failed": 1,
  "total": 19
}
```

### Example 5: Cancel a queued job

```bash
curl -X DELETE http://localhost:3000/api/admin/jobs/507f1f77bcf86cd799439011
```

---

## Polling Pattern

For clients that need to monitor job progress, here's the recommended pattern:

```javascript
async function waitForJobCompletion(jobId, maxWaitMs = 600000) {
  const startTime = Date.now();
  const pollIntervalMs = 1000; // Poll every 1 second

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(`/api/admin/jobs/${jobId}`);
    const job = await response.json();

    if (job.status === "done") {
      return { success: true, job };
    }

    if (job.status === "failed") {
      return { success: false, job, error: job.error };
    }

    // Still running, wait and retry
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  return { success: false, error: "timeout" };
}
```

---

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `job_invalid_type` | 400 | Job type not recognized |
| `job_invalid_payload` | 400 | Payload is missing or not an object |
| `job_invalid_max_attempts` | 400 | maxAttempts < 1 |
| `job_invalid_status_filter` | 400 | Invalid status query parameter |
| `job_invalid_type_filter` | 400 | Invalid type query parameter |
| `job_invalid_limit` | 400 | limit not in range [1, 100] |
| `job_invalid_offset` | 400 | offset < 0 |
| `job_id_required` | 400 | jobId path parameter missing |
| `job_not_found` | 404 | Job doesn't exist in database |
| `job_cannot_cancel_non_queued` | 400 | Can only cancel queued jobs |

---

## Rate Limiting

Rate limiting is enabled for admin APIs and auth-abuse-sensitive routes.

For enqueue retries, use `Idempotency-Key` to guarantee safe client retries without duplicating side effects.

---

## Best Practices

### 1. Always check job status asynchronously

Never block on job completion. Use polling or webhooks instead.

```javascript
// ✅ Good: Fire and forget, then poll
const result = await enqueueJob(...);
const jobId = result.id;

// Poll later
const status = await getJobStatus(jobId);

// ❌ Bad: Blocking request
app.post("/upload", async (req, res) => {
  const job = await enqueueJob(...);
  const completed = await waitForCompletion(job.id); // Can timeout!
  res.json(completed);
});
```

### 2. Validate payloads before enqueueing

Catch payload errors early in the API layer, not in the worker.

```javascript
// ✅ Good: Validate in controller
if (!payload.sourcePath) {
  throw new Error("sourcePath required");
}
```

### 3. Handle retries gracefully

Jobs can be retried up to `maxAttempts`. Plan for this:

```javascript
// Monitor for failures
const job = await getJobStatus(jobId);
if (job.status === "failed") {
  // Cleanup, notify user, etc.
}
```

### 4. Use appropriate maxAttempts

- **INGEST**: 3-5 attempts (file might be temporarily unavailable)
- **WRITE_METADATA**: 2-3 attempts (idempotent operation)
- **DELETE_BOOK**: 1-2 attempts (shouldn't fail once started)

---

## Integration with Frontend

### React Example

```javascript
// Hook to enqueue and monitor job
function useBackgroundJob() {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(false);

  const enqueue = async (type, payload) => {
    setLoading(true);
    const res = await fetch("/api/admin/jobs/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload, maxAttempts: 3 }),
    });
    const jobData = await res.json();
    setJob(jobData);

    // Poll for completion
    const statusIntervalId = setInterval(async () => {
      const statusRes = await fetch(`/api/admin/jobs/${jobData.id}`);
      const updatedJob = await statusRes.json();
      setJob(updatedJob);

      if (["done", "failed"].includes(updatedJob.status)) {
        clearInterval(statusIntervalId);
        setLoading(false);
      }
    }, 2000);
  };

  return { job, loading, enqueue };
}
```

---

## Monitoring & Debugging

### Check queue health

```bash
# Get stats
curl http://localhost:3000/api/admin/jobs/stats

# If many failed jobs, investigate:
curl "http://localhost:3000/api/admin/jobs?status=failed&limit=10"

# Check logs in worker service for error details
docker logs audiobook-worker
```

### Diagnose slow jobs

```bash
# Check running jobs
curl "http://localhost:3000/api/admin/jobs?status=running"

# Look at startedAt vs now to see elapsed time
```

### Manual job management in MongoDB

```javascript
// Reset a stuck job
db.jobs.updateOne(
  { _id: ObjectId("...") },
  {
    $set: {
      status: "queued",
      lockedBy: null,
      lockedAt: null,
      runAfter: new Date()
    }
  }
)
```
