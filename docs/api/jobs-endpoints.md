# Job Queue API — Endpoint Reference

## Overview

The Job Queue API allows clients to enqueue long-running background tasks and monitor their execution. All job operations are performed asynchronously through the worker service.

## Base URL

```
/api/jobs
```

## Authentication

All job queue endpoints are **public** (no authentication required). In a production environment, consider adding authentication middleware to restrict job creation.

---

## Endpoints

### Enqueue Job

**POST** `/api/jobs/enqueue`

Create and queue a new background job.

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

**GET** `/api/jobs/:jobId`

Retrieve the current status and details of a specific job.

#### Request

```
GET /api/jobs/507f1f77bcf86cd799439011
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

**GET** `/api/jobs`

List jobs with optional filtering and pagination.

#### Request

```
GET /api/jobs?status=running&type=INGEST&limit=20&offset=0
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
  "total": 2
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

### Get Job Queue Statistics

**GET** `/api/jobs/stats`

Get aggregated statistics about the job queue.

#### Request

```
GET /api/jobs/stats
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

**DELETE** `/api/jobs/:jobId`

Cancel a queued job (only works if job hasn't started yet).

#### Request

```
DELETE /api/jobs/507f1f77bcf86cd799439011
```

#### Response

**Status**: 200 OK

```json
{
  "id": "507f1f77bcf86cd799439011",
  "type": "INGEST",
  "status": "failed",
  "payload": { "sourcePath": "/uploads/audiobook.m4b" },
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
curl -X POST http://localhost:3000/api/jobs/enqueue \
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
  curl -s http://localhost:3000/api/jobs/$JOB_ID | jq '.status'
  sleep 2
done
```

### Example 3: List all failed jobs

```bash
curl "http://localhost:3000/api/jobs?status=failed&limit=50" | jq '.jobs'
```

### Example 4: Get queue statistics

```bash
curl http://localhost:3000/api/jobs/stats | jq '.'
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
curl -X DELETE http://localhost:3000/api/jobs/507f1f77bcf86cd799439011
```

---

## Polling Pattern

For clients that need to monitor job progress, here's the recommended pattern:

```javascript
async function waitForJobCompletion(jobId, maxWaitMs = 600000) {
  const startTime = Date.now();
  const pollIntervalMs = 1000; // Poll every 1 second

  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(`/api/jobs/${jobId}`);
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

Currently, there are no rate limits on the job queue API. In production, consider implementing:
- Per-IP rate limiting (e.g., 100 requests/minute)
- Per-user rate limiting (if authenticated)
- Job type-specific limits (e.g., max 5 concurrent INGESTs)

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
    const res = await fetch("/api/jobs/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload, maxAttempts: 3 }),
    });
    const jobData = await res.json();
    setJob(jobData);

    // Poll for completion
    const statusIntervalId = setInterval(async () => {
      const statusRes = await fetch(`/api/jobs/${jobData.id}`);
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
curl http://localhost:3000/api/jobs/stats

# If many failed jobs, investigate:
curl "http://localhost:3000/api/jobs?status=failed&limit=10"

# Check logs in worker service for error details
docker logs audiobook-worker
```

### Diagnose slow jobs

```bash
# Check running jobs
curl "http://localhost:3000/api/jobs?status=running"

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
