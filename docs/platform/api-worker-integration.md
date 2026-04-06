# Audiobook Platform — API & Worker Integration Guide

## Overview

This document describes the complete integration between the API server and the Background Worker service for processing audiobooks asynchronously.

## Architecture

### Services

```
┌─────────────────────────────────────────────────────────────────────┐
│ Client (Web/Mobile)                                                 │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 │ HTTP REST
                 │
┌────────────────▼────────────────────────────────────────────────────┐
│ API Server (api/)                                                   │
├─────────────────────────────────────────────────────────────────────┤
│ POST   /api/jobs/enqueue          ─→ Validates payload              │
│ GET    /api/jobs                  ─→ List/filter jobs               │
│ GET    /api/jobs/:jobId           ─→ Get job status                 │
│ GET    /api/jobs/stats            ─→ Queue statistics               │
│ DELETE /api/jobs/:jobId           ─→ Cancel job                     │
│                                                                      │
│ JobService ──────────┐                                              │
│                      │                                              │
└──────────────────────┼──────────────────────────────────────────────┘
                       │
                       │ MongoDB
                       │
┌──────────────────────▼──────────────────────────────────────────────┐
│ MongoDB (books.jobs)                                                │
├─────────────────────────────────────────────────────────────────────┤
│ Collection: jobs                                                    │
│ ├─ _id: ObjectId                                                   │
│ ├─ type: "INGEST" | "WRITE_METADATA" | ...                        │
│ ├─ status: "queued" | "running" | "done" | "failed" | "retrying"  │
│ ├─ payload: { ... }                                                │
│ ├─ attempt: number                                                 │
│ ├─ maxAttempts: number                                             │
│ ├─ runAfter: Date                                                  │
│ ├─ lockedBy: workerId | null                                       │
│ ├─ error: { ... } | null                                           │
│ └─ timestamps: createdAt, updatedAt, startedAt, finishedAt        │
└──────────────────┬───────────────────────────────────────────────────┘
                   │
                   │ Polls every WORKER_POLL_MS
                   │
┌──────────────────▼───────────────────────────────────────────────────┐
│ Background Worker (worker/)                                         │
├─────────────────────────────────────────────────────────────────────┤
│ JobRunner                                                            │
│ ├─ Concurrency: WORKER_CONCURRENCY (default 2)                     │
│ ├─ Poll Interval: WORKER_POLL_MS (default 5000ms)                 │
│ ├─ Retry Base: WORKER_RETRY_BASE_MS (default 2000ms)              │
│ └─ Retry Max: WORKER_RETRY_MAX_MS (default 60000ms)               │
│                                                                      │
│ JobProcessor (state machine)                                        │
│ ├─ claim() - Atomic status update                                  │
│ ├─ execute() - Run handler function                                │
│ ├─ retry() - Exponential backoff scheduling                        │
│ └─ fail() - Mark as failed                                         │
│                                                                      │
│ Job Handlers                                                         │
│ ├─ handleIngestJob() - Full implementation                         │
│ ├─ handleExtractCoverJob() - Placeholder                           │
│ ├─ handleWriteMetadataJob() - Placeholder                          │
│ └─ ... others                                                       │
│                                                                      │
│ Services                                                             │
│ ├─ FFmpegService                                                   │
│ ├─ FileService                                                     │
│ ├─ MetadataService                                                 │
│ ├─ ChecksumService                                                 │
│ └─ MongooseConnection (shared with API)                            │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Enqueuing a Job

```
Client
  │
  └─→ POST /api/jobs/enqueue { type: "INGEST", payload: {...} }
       │
       └─→ JobController.enqueueJob()
            │
            └─→ JobService.enqueueJob()
                 │
                 └─→ JobModel.create()
                      │
                      └─→ MongoDB (books.jobs)
                           { type: "INGEST", status: "queued", ... }
                           │
                           └─→ Return JobDTO to client
```

**Example Request:**
```bash
curl -X POST http://localhost:3000/api/jobs/enqueue \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INGEST",
    "payload": { "sourcePath": "/uploads/book.m4b" },
    "maxAttempts": 3
  }'
```

**Response:**
```json
{
  "id": "507f...",
  "type": "INGEST",
  "status": "queued",
  "attempt": 0,
  "maxAttempts": 3,
  "createdAt": "2026-04-06T10:30:00Z"
}
```

### 2. Processing in Worker

```
Worker Service (every WORKER_POLL_MS)
  │
  ├─→ Query: Find jobs where status="queued" AND runAfter <= now
  │    Limit to WORKER_CONCURRENCY available slots
  │
  └─→ For each job:
       │
       ├─→ JobProcessor.claim()
       │    │
       │    └─→ Atomic update: { $set: { status: "running", lockedBy: workerId } }
       │        ├─ Success: Continue
       │        └─ Failure: Another worker claimed it (skip)
       │
       ├─→ JobProcessor.execute()
       │    │
       │    └─→ Get handler function for job.type
       │         │
       │         └─→ await handler(job)
       │              ├─ Write handler logs
       │              ├─ Process the job
       │              └─ Return or throw
       │
       ├─ If success:
       │    └─→ Update: { $set: { status: "done", finishedAt: now } }
       │
       └─ If error:
            └─→ Check: attempt < maxAttempts?
                ├─ YES: Retry
                │        Calculate backoff: 2000 * 2^(attempt-1), capped at 60000ms
                │        Update: { $set: { status: "retrying", runAfter: now+backoff } }
                │
                └─ NO: Final failure
                       Update: { $set: { status: "failed", finishedAt: now, error: {...} } }
```

### 3. Polling Job Status

```
Client (polls every N seconds)
  │
  └─→ GET /api/jobs/{jobId}
       │
       └─→ JobController.getJob()
            │
            └─→ JobService.getJobById()
                 │
                 └─→ JobModel.findById()
                      │
                      └─→ MongoDB (fetch document)
                           │
                           └─→ Return JobDTO to client
                                With updated status, attempt count, etc.
```

**Response Examples:**

Still running:
```json
{
  "id": "507f...",
  "status": "running",
  "attempt": 1,
  "startedAt": "2026-04-06T10:30:10Z",
  "finishedAt": null
}
```

Completed:
```json
{
  "id": "507f...",
  "status": "done",
  "attempt": 1,
  "finishedAt": "2026-04-06T10:31:20Z"
}
```

Failed with retry:
```json
{
  "id": "507f...",
  "status": "retrying",
  "attempt": 1,
  "runAfter": "2026-04-06T10:31:05Z",
  "error": { "code": "timeout", "message": "FFmpeg operation exceeded 5m" }
}
```

Permanently failed:
```json
{
  "id": "507f...",
  "status": "failed",
  "attempt": 3,
  "maxAttempts": 3,
  "finishedAt": "2026-04-06T10:36:45Z",
  "error": { "code": "timeout", "message": "FFmpeg operation exceeded 5m" }
}
```

## Environment Configuration

### API Server (api/.env)

```bash
# Server
NODE_ENV=production
PORT=3000

# Database
MONGO_URL=mongodb://mongo:27017/audiobook

# CORS
CORS_ORIGINS=http://localhost:3001,https://app.example.com

# OAuth (optional)
GOOGLE_CLIENT_IDS=client1.apps.googleusercontent.com,client2.apps.googleusercontent.com
APPLE_CLIENT_ID=com.example.audiobook
```

### Worker Service (worker/.env)

```bash
# Database
MONGO_URL=mongodb://mongo:27017/audiobook

# Job Processing
WORKER_POLL_MS=5000                 # Poll interval (milliseconds)
WORKER_CONCURRENCY=2                # Max concurrent jobs
WORKER_RETRY_BASE_MS=2000           # Initial retry backoff (milliseconds)
WORKER_RETRY_MAX_MS=60000           # Max retry backoff (milliseconds)

# File System
AUDIOBOOKS_PATH=/data/audiobooks    # Host mount point

# FFmpeg (optional)
FFMPEG_TIMEOUT_MS=300000            # 5 minutes
```

### Docker Compose

```yaml
version: "3.9"
services:
  mongo:
    image: mongo:9.3
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

  api:
    build: ./api
    ports:
      - "3000:3000"
    environment:
      MONGO_URL: mongodb://mongo:27017/audiobook
      CORS_ORIGINS: http://localhost:3001
    depends_on:
      - mongo

  worker:
    build: ./worker
    environment:
      MONGO_URL: mongodb://mongo:27017/audiobook
      WORKER_POLL_MS: 5000
      WORKER_CONCURRENCY: 2
      WORKER_RETRY_BASE_MS: 2000
      WORKER_RETRY_MAX_MS: 60000
      AUDIOBOOKS_PATH: /data/audiobooks
    volumes:
      - audiobooks:/data/audiobooks
    depends_on:
      - mongo

volumes:
  mongo_data:
  audiobooks:
```

## API Endpoints Reference

### Quick Reference

```
POST   /api/jobs/enqueue              Create and queue a job
GET    /api/jobs                      List jobs (filterable)
GET    /api/jobs/stats                Get queue statistics
GET    /api/jobs/:jobId               Get job status
DELETE /api/jobs/:jobId               Cancel a queued job
```

See [Job API Endpoints](./api/jobs-endpoints.md) for complete endpoint documentation.

## Job Types

| Type | Purpose | Status |
|------|---------|--------|
| INGEST | Upload and process audiobook | ✅ Implemented |
| WRITE_METADATA | Update chapter info | ⏳ Placeholder |
| EXTRACT_COVER | Save cover image | ⏳ Placeholder |
| DELETE_BOOK | Remove book and files | ⏳ Placeholder |
| REPLACE_FILE | Swap audio file | ⏳ Placeholder |
| RESCAN | Find and ingest new books | ⏳ Placeholder |

## INGEST Job Details

The fully implemented INGEST job handles end-to-end audiobook processing:

**Process:**
1. Probe M4B file for duration, format, bitrate
2. Compute SHA256 checksum for integrity
3. Extract FFmetadata (title, artist, album, chapters)
4. Create Book document in MongoDB
5. Create audiobooks directory
6. Atomically copy audio file to final location
7. Extract and save cover image (if present)
8. Update Book document with file paths

**Payload:**
```json
{ "sourcePath": "/path/to/audiobook.m4b" }
```

**Success Output (stored in book document):**
- filePath: `/data/audiobooks/{bookId}/audio.m4b`
- coverPath: `/data/audiobooks/{bookId}/cover.jpg`
- checksum: `sha256:a1b2c3d4...`
- title, author, series (from metadata)
- duration (in seconds)
- chapters (array with timestamps)

## Error Handling

### API Level

The API validates:
- Job type is valid
- Payload is provided and is an object
- maxAttempts >= 1
- Query parameters are correct types and ranges

**Error Response:**
```json
{
  "message": "job_invalid_type"
}
```

See [Job API Endpoints](./api/jobs-endpoints.md) for complete error codes.

### Worker Level

The Worker handles:
- File not found
- FFmpeg timeout (5 minutes)
- Corrupted audio files
- Metadata parsing errors
- Disk space issues

**Retry Logic:**
- Attempt 1 fails → Wait 2s, retry
- Attempt 2 fails → Wait 4s, retry
- Attempt 3 fails → Wait 8s, retry
- Attempt 4 fails → Wait 16s, retry
- Attempt 5 fails → Give up, mark as failed
- (Exact count depends on maxAttempts)

## Operational Procedures

### Monitor Queue Health

```bash
# Check statistics
curl http://localhost:3000/api/jobs/stats

# List failed jobs
curl "http://localhost:3000/api/jobs?status=failed&limit=20"

# Check running jobs
curl "http://localhost:3000/api/jobs?status=running"
```

### Diagnose Stuck Jobs

```bash
# A job in "running" status for > 10 minutes is stuck
curl "http://localhost:3000/api/jobs?status=running" | jq '
  .jobs[] | 
  select(now - (.startedAt | fromdateiso8601) > 600)
'

# Check worker logs
docker logs audiobook-worker

# Force reset stuck job (in MongoDB directly)
db.jobs.updateOne(
  { _id: ObjectId("...") },
  { $set: { status: "queued", lockedBy: null, lockedAt: null, runAfter: new Date() } }
)
```

### Scale Worker Processing

To increase throughput:

```bash
# Increase concurrent jobs
WORKER_CONCURRENCY=4 npm start

# Reduce poll interval (more responsive but higher CPU)
WORKER_POLL_MS=2000 npm start

# Or update Docker Compose and redeploy
docker-compose up --scale worker=2  # Multiple worker instances
```

### View Job Execution Logs

Worker logs to stdout. View with:

```bash
# Docker
docker logs audiobook-worker

# File (if redirected)
tail -f logs/worker.log
```

Log entries include:
- `ingest job started` - Initial job claim
- `ingest: file probed` - Duration detected
- `ingest: checksum computed` - SHA256 hash
- `ingest: metadata extracted` - Title, artist, chapters
- `ingest: book directory created` - Audiobooks dir ready
- `ingest: audio file copied` - File in place
- `ingest: cover extracted` - Cover art saved (optional)
- `ingest job completed` - Success

## Development Workflow

### Local Setup

```bash
# Install dependencies
npm install

# Build both packages
npm run build  # From api/
npm run build  # From worker/

# Start in development
npm run dev    # From api/ - watches for changes
npm run dev    # From worker/ - watches for changes
```

### Testing End-to-End

```bash
# 1. Start services
docker-compose up

# 2. Create ingest job
curl -X POST http://localhost:3000/api/jobs/enqueue \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INGEST",
    "payload": { "sourcePath": "/uploads/test.m4b" },
    "maxAttempts": 3
  }'

# 3. Monitor progress
JOB_ID="507f..."
while true; do
  curl http://localhost:3000/api/jobs/$JOB_ID | jq '.status' && sleep 2
done

# 4. Check results
curl http://localhost:3000/api/jobs/$JOB_ID | jq '.'
docker logs audiobook-worker
```

## Files Modified/Created

**API**:
- ✅ `api/src/modules/jobs/job.service.ts` - Created
- ✅ `api/src/modules/jobs/job.controller.ts` - Created
- ✅ `api/src/modules/jobs/job.routes.ts` - Implemented
- ✅ `api/src/modules/jobs/job.model.ts` - Already exists
- ✅ `api/src/app.ts` - Updated (added job routes)
- ✅ `docs/api/jobs-endpoints.md` - Endpoint reference

**Worker**:
- ✅ `worker/src/queue/job.types.ts` - Already implemented
- ✅ `worker/src/queue/job.processor.ts` - Already implemented
- ✅ `worker/src/queue/job.runner.ts` - Already implemented
- ✅ `worker/src/jobs/ingest.job.ts` - Fully implemented
- ✅ `worker/src/services/*` - All services implemented
- ✅ `docs/worker/technical-reference.md` - Worker technical reference

## Build Status

```
api/        ✅ npm run build - SUCCESS
worker/     ✅ npm run build - SUCCESS
```

## Next Steps

1. **Implement remaining job handlers**
   - Extract Cover
   - Write Metadata
   - Delete Book
   - Replace File
   - Rescan

2. **Add authentication** (optional)
   - Protect job endpoints with auth middleware
   - Per-user job isolation

3. **Enhanced monitoring**
   - Webhook callbacks on job completion
   - Archive completed jobs to separate collection
   - Job execution metrics/dashboards

4. **Advanced features**
   - Bulk job enqueue endpoint
   - Job dependency chains
   - Job priority levels
   - Dead letter queue for permanent failures

## References

- [Worker Service Technical Documentation](./worker/technical-reference.md)
- [API Jobs Endpoint Reference](./api/jobs-endpoints.md)
- [Architecture & Build Specification](./architecture-build-specification.md)
- [FFmpeg Metadata and Chapters Guide](./ffmpeg/metadata-chapters-guide.md)
