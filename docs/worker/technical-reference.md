# Worker Service — Technical Reference

## Overview

The **Worker Service** is a background job queue system for long-running, CPU-intensive audio processing tasks. It uses MongoDB as a persistent job store, enabling distributed processing, automatic retries, graceful failure handling, and configurable scheduling policies.

### Key Responsibilities

- **Job Queue Management**: Poll MongoDB queue, atomically claim jobs with configurable concurrency
- **Audio Processing**: Ingest audiobook files (M4A, M4B, MP3, OGG, WAV), extract metadata/chapters
- **MP3 Fast-Publish**: Publish MP3 immediately for playback, defer M4B conversion to background
- **Metadata Handling**: Parse/generate FFmetadata format, embed chapters into audio files
- **Cover Art**: Extract from embedded images, replace covers, optimize for storage
- **File Operations**: Atomic writes, safe deletions, error recovery
- **FFmpeg Integration**: Probe files, encode formats, extract metadata
- **Reliability**: Exponential backoff retries, distributed locking, graceful shutdown

---

## Architecture

### High-Level System Design

```
┌────────────────────┐
│   API Server       │
│  (admin routes)    │
└────────┬───────────┘
         │
         │ POST /api/v1/admin/jobs/enqueue
         │ GET  /api/v1/admin/jobs/:jobId
         │
┌────────▼──────────────────┐
│   MongoDB (books.jobs)     │
│  ┌─ queued jobs           │
│  ├─ running jobs          │
│  ├─ retrying jobs         │
│  ├─ completed jobs        │
│  └─ failed jobs           │
└────────▲──────────────────┘
         │
         │ Polls every WORKER_POLL_MS
         │
┌────────┴──────────────────┐
│    Worker Service         │
├───────────────────────────┤
│ JobRunner                 │
│  ├─ Claim jobs (atomic)   │
│  └─ Execute handlers      │
├───────────────────────────┤
│ Job Handlers              │
│  ├─ INGEST                │
│  ├─ INGEST_MP3_AS_M4B    │
│  ├─ SANITIZE_MP3_TO_M4B  │
│  ├─ WRITE_METADATA        │
│  ├─ EXTRACT_COVER         │
│  ├─ REPLACE_COVER         │
│  ├─ REPLACE_FILE          │
│  ├─ RESCAN                │
│  ├─ SYNC_TAGS             │
│  └─ DELETE_BOOK           │
├───────────────────────────┤
│ Services                  │
│  ├─ FFmpegService         │
│  ├─ FileService           │
│  ├─ MetadataService       │
│  ├─ MP3MetadataService    │
│  ├─ ChecksumService       │
│  ├─ ParitySchedulerService│
│  └─ TagSyncSchedulerService│
├───────────────────────────┤
│ Storage                   │
│  ├─ /uploads/             │
│  └─ /data/audiobooks/     │
└───────────────────────────┘
```

### Job Lifecycle State Machine

```
[CREATED]
   │
   ▼
[QUEUED] ─────────────────────┐
   │                          │
   │ (worker claims)          │
   ▼                          │
[RUNNING]                     │
   │                          │
   ├─ (success) ───────────> [DONE] ✓
   │
   └─ (error)
       │
       ├─ (attempt < max)
       │   └──────────────> [RETRYING] ──┐
       │                                  │
       │                                  │ (after backoff)
       │                                  │
       │                                  └───> [QUEUED]
       │
       └─ (attempt >= max)
           └──────────────> [FAILED] ✗
```

**Atomic Claim Operation**: When a worker claims a job:

```typescript
db.jobs.findOneAndUpdate(
  { _id: jobId, status: "queued" },
  {
    $set: {
      status: "running",
      lockedBy: workerId,
      lockedAt: now,
    },
  },
);
```

This ensures only one worker can claim the same job.

---

## Job Types

### INGEST

**Purpose**: Process native M4B/M4A audiobook files

**Payload**:

```json
{
  "sourcePath": "/uploads/mybook.m4b",
  "language": "en"
}
```

**Process Flow**:

1. Validate source file exists
2. Probe audio file (duration, format, bitrate)
3. Compute SHA256 checksum
4. Extract FFmetadata (title, artist, album)
5. Parse ffmetadata to extract chapters
6. Create Book document in MongoDB
7. Copy audio file to `/data/audiobooks/{bookId}/audio.m4b`
8. Extract and save cover image (if present)
9. Verify file sync status
10. Update Book with all metadata

**Success Output**:

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "filePath": "/data/audiobooks/507f1f77bcf86cd799439011/audio.m4b",
  "coverPath": "/data/audiobooks/507f1f77bcf86cd799439011/cover.jpg",
  "checksum": "sha256:a1b2c3d4e5f6...",
  "duration": 86400,
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "chapters": 42
}
```

**Error Codes**:

- `ingest_source_not_found` - Source file doesn't exist
- `ingest_payload_invalid` - Missing sourcePath or language
- `ingest_probe_failed` - FFmpeg couldn't probe file
- `ingest_metadata_parse_failed` - Couldn't read embedded metadata

**Priority**: 80  
**Heavy**: No

---

### INGEST_MP3_AS_M4B

**Purpose**: Publish MP3 immediately (fast-path), enqueue deferred M4B conversion

**Payload**:

```json
{
  "sourcePath": "/uploads/audiobook.mp3",
  "coverPath": "/uploads/cover.jpg",
  "language": "en",
  "title": "My Audiobook",
  "author": "Some Author",
  "series": null,
  "genre": "Spoken Word"
}
```

**Process Flow**:

1. Validate MP3 file and probe duration
2. Create Book document with `processingState: "pending_sanitize"`
3. Copy MP3 to `/data/audiobooks/{bookId}/audio.mp3`
4. Save cover image if provided (or skip)
5. Return immediately (don't wait for encoding)
6. Enqueue `SANITIZE_MP3_TO_M4B` job with priority 20 for later encode
7. Book is immediately available for streaming via MP3 fallback

**Success Output**:

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "filePath": "/data/audiobooks/507f1f77bcf86cd799439011/audio.mp3",
  "coverPath": "/data/audiobooks/507f1f77bcf86cd799439011/cover.jpg",
  "checksum": "sha256:...",
  "duration": 14400,
  "title": "My Audiobook",
  "author": "Some Author",
  "processingState": "pending_sanitize"
}
```

**Book Processing State Transitions**:

```
INGEST_MP3_AS_M4B done
  └─> Book.processingState = "pending_sanitize"
        └─> SANITIZE job starts
              └─> Book.processingState = "sanitizing"
                    ├─ (success) ──> Book.processingState = "ready"
                    └─ (failure) ──> Book.processingState = "sanitize_failed"
                                     (MP3 still playable)
```

**Priority**: 80  
**Heavy**: No

---

### SANITIZE_MP3_TO_M4B

**Purpose**: Encode MP3 to M4B format and swap files (background job)

**Payload**:

```json
{
  "bookId": "507f1f77bcf86cd799439011"
}
```

**Process Flow**:

1. Load Book document, validate MP3 file exists
2. Encode MP3 → M4B to temporary file (CPU-intensive)
3. Compute checksum of new M4B
4. Move M4B to final location
5. Delete temporary files
6. Delete old MP3
7. Update Book with M4B path, checksum, `processingState: "ready"`

**Success Output**:

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "filePath": "/data/audiobooks/507f1f77bcf86cd799439011/audio.m4b",
  "checksum": "sha256:...",
  "duration": 14402
}
```

**Auto-Enqueued By**: `INGEST_MP3_AS_M4B`  
**Priority**: 20  
**Heavy**: Yes (Subject to time-window scheduling if configured)

---

### WRITE_METADATA

**Purpose**: Embed metadata and chapters into audio file via remux

**Payload**:

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "title": "Updated Title",
  "author": "Updated Author",
  "series": "Series Name",
  "genre": "Fiction",
  "chapters": [
    {
      "index": 0,
      "title": "Prologue",
      "start": 0,
      "end": 1800
    },
    {
      "index": 1,
      "title": "Chapter 1",
      "start": 1800,
      "end": 3600
    }
  ]
}
```

**Process Flow**:

1. Load Book document
2. Generate FFmetadata file from provided chapters
3. Remux audio with new metadata using FFmpeg
4. Move remuxed file to temporary location
5. Compute checksum of new file
6. Atomically replace original audio file
7. Update Book metadata fields
8. Update chapter list
9. Update file sync timestamps

**Success Output**:

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "filePath": "/data/audiobooks/507f1f77bcf86cd799439011/audio.m4b",
  "title": "Updated Title",
  "author": "Updated Author",
  "series": "Series Name",
  "genre": "Fiction",
  "chapters": 2
}
```

**Priority**: 35  
**Heavy**: No

---

### EXTRACT_COVER

**Purpose**: Extract cover image from embedded audio metadata

**Payload**:

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "force": false
}
```

**Process Flow**:

1. Load Book document
2. Check if cover already exists (unless `force: true`)
3. Extract first attached image using FFmpeg
4. Save as JPEG to `/data/audiobooks/{bookId}/cover.jpg`
5. Update Book `coverPath` field
6. Mark file as in-sync

**Success Output**:

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "coverPath": "/data/audiobooks/507f1f77bcf86cd799439011/cover.jpg",
  "skipped": false
}
```

**Skipped Output** (cover exists):

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "coverPath": "/data/audiobooks/507f1f77bcf86cd799439011/cover.jpg",
  "skipped": true,
  "reason": "cover_already_exists"
}
```

**Priority**: 50  
**Heavy**: No

---

### REPLACE_COVER

**Purpose**: Replace embedded cover and remux audio file

**Payload**:

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "sourcePath": "/uploads/newcover.jpg"
}
```

**Process Flow**:

1. Load Book document
2. Validate source cover file exists
3. Remux audio with new cover using FFmpeg
4. Atomically replace original audio file
5. Replace cover.jpg on disk
6. Update file sync timestamps

**Success Output**:

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "filePath": "/data/audiobooks/507f1f77bcf86cd799439011/audio.m4b",
  "coverPath": "/data/audiobooks/507f1f77bcf86cd799439011/cover.jpg"
}
```

**Priority**: 50  
**Heavy**: No

---

### REPLACE_FILE

**Purpose**: Swap audio file for a book and update metadata

**Payload**:

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "sourcePath": "/uploads/replacement.m4b",
  "extractCover": true
}
```

**Process Flow**:

1. Load Book document
2. Validate replacement file exists
3. Probe new file (duration, format)
4. Compute SHA256 checksum
5. Atomically replace original audio file
6. Extract cover from new file (if `extractCover: true`)
7. Update Book with new duration, checksum, chapter list
8. Mark file as in-sync

**Success Output**:

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "filePath": "/data/audiobooks/507f1f77bcf86cd799439011/audio.m4b",
  "sourcePath": "/uploads/replacement.m4b",
  "checksum": "sha256:...",
  "duration": 87211,
  "chapters": 44,
  "coverPath": "/data/audiobooks/507f1f77bcf86cd799439011/cover.jpg"
}
```

**Priority**: 20  
**Heavy**: Yes

---

### RESCAN

**Purpose**: Verify library files and sync database state

**Payload**:

```json
{
  "force": false
}
```

**Process Flow**:

1. Query books from MongoDB
2. If `force: false`, only check books where `fileSync.status !== "in_sync"`
3. For each book:
   - Verify file exists on disk
   - Recompute duration and checksum
   - Compare with database values
   - Update sync status and timestamps
4. Collect statistics (scanned, updated, missing, errors)

**Success Output**:

```json
{
  "force": false,
  "targetCount": 127,
  "scanned": 127,
  "updated": 12,
  "missing": 2,
  "errors": 1
}
```

**Priority**: 50  
**Heavy**: No

---

### SYNC_TAGS

**Purpose**: Synchronize taxonomy/tag data across books.

**Payload**:

```json
{
  "force": false
}
```

**Process Flow**:

1. Load taxonomy settings from worker settings
2. Scan eligible books for tag normalization/sync
3. Normalize and merge tag/category values
4. Persist updated tag fields where needed
5. Return aggregate sync counters

**Success Output**:

```json
{
  "force": false,
  "targetCount": 127,
  "updated": 19,
  "skipped": 108,
  "errors": 0
}
```

**Priority**: 40  
**Heavy**: No

---

### DELETE_BOOK

**Purpose**: Remove book record and files

**Payload**:

```json
{
  "bookId": "507f1f77bcf86cd799439011"
}
```

**Process Flow**:

1. Load Book document
2. Delete book record from MongoDB
3. Delete entire audiobook directory
4. Clean up related progress, collection entries

**Success Output**:

```json
{
  "bookId": "507f1f77bcf86cd799439011",
  "deleted": true,
  "filesDeleted": true
}
```

**Priority**: 50  
**Heavy**: No

---

## Configuration

### Environment Variables

```bash
# MongoDB Connection
MONGO_URI=mongodb://mongo:27017/audiobook

# Worker Queue Settings
WORKER_POLL_MS=1500                 # Polling interval (milliseconds)
WORKER_CONCURRENCY_HEAVY=1          # Heavy lane concurrency
WORKER_CONCURRENCY_FAST=0           # Fast lane concurrency
# Optional legacy fallback read by runner:
WORKER_CONCURRENCY=0

# Locking / recovery
WORKER_JOB_LOCK_TIMEOUT_MS=600000   # Reclaim stale lock timeout (10 min)
WORKER_LOCK_RECLAIM_INTERVAL_MS=300000 # Lock reclaim sweep interval (5 min)

# Retry Configuration
WORKER_RETRY_BASE_MS=2000           # Initial backoff (2 seconds)
WORKER_RETRY_MAX_MS=60000           # Max backoff (60 seconds)

# FFmpeg
FFMPEG_TIMEOUT_MS=300000            # Timeout (5 minutes)

# Storage
AUDIOBOOKS_PATH=/data/audiobooks    # Final audiobook storage
```

### Worker Settings Document

Stored in MongoDB `worker_settings` collection with dynamic configuration:

```json
{
  "key": "worker",
  "queue": {
    "heavyJobTypes": ["SANITIZE_MP3_TO_M4B", "REPLACE_FILE"],
    "heavyJobDelayMs": 0,
    "heavyWindowEnabled": false,
    "heavyWindowStart": "03:00",
    "heavyWindowEnd": "05:00",
    "heavyConcurrency": 1,
    "fastConcurrency": 0
  },
  "parity": {
    "enabled": true,
    "intervalMs": 3600000
  },
  "taxonomy": {
    "enabled": true,
    "intervalMs": 3600000
  }
}
```

**Field Descriptions**:

- `heavyJobTypes`: Jobs subject to time-window scheduling
- `heavyJobDelayMs`: Extra delay added to `runAfter` for heavy jobs
- `heavyWindowEnabled`: If true, restrict heavy jobs to time window
- `heavyWindowStart`/`heavyWindowEnd`: When heavy jobs can run (HH:MM format)
- `heavyConcurrency`: Max slots for "any" lane (all job types)
- `fastConcurrency`: Max slots for "fast" lane (lightweight jobs only)
- `parity.enabled`/`parity.intervalMs`: Controls scheduled RESCAN enqueue cadence
- `taxonomy.enabled`/`taxonomy.intervalMs`: Controls scheduled SYNC_TAGS enqueue cadence

**Behavior**:

- When time-window is enabled and current time is outside window, heavy jobs are excluded from polling
- Fast lane allows non-heavy jobs to continue flowing while heavy jobs wait
- Reloaded every 15 seconds and applied on next poll cycle

---

## Retry Logic

### Backoff Formula

```
backoff_ms = min(
  WORKER_RETRY_BASE_MS * 2^(attempt - 1),
  WORKER_RETRY_MAX_MS
)
```

**Example with defaults** (BASE=2s, MAX=60s):

| Attempt | Backoff | Retry After |
| ------- | ------- | ----------- |
| 1       | 2 s     | now + 2s    |
| 2       | 4 s     | now + 4s    |
| 3       | 8 s     | now + 8s    |
| 4       | 16 s    | now + 16s   |
| 5       | 32 s    | now + 32s   |
| 6       | 60 s    | now + 60s   |
| 7+      | 60 s    | now + 60s   |
| max (3) | —       | FAILED      |

---

## Running the Worker

### Development

```bash
cd worker

# Install dependencies
npm install

# Run with live reload (uses nodemon)
npm run dev

# Output:
# > worker@1.0.0 dev
# > nodemon --exec ts-node src/worker.ts
# ✓ Connected to MongoDB
# ✓ Job runner started (heavy=1, fast=0, pollMs=1500)
```

### Production Build

```bash
# Compile TypeScript
npm run build

# Run compiled code
npm start

# With environment overrides
WORKER_CONCURRENCY_HEAVY=2 \
WORKER_CONCURRENCY_FAST=2 \
WORKER_POLL_MS=3000 \
npm start
```

### Docker

```bash
docker build -t audiobook-worker .
docker run -e MONGO_URI=mongodb://mongo:27017/audiobook \
           -e WORKER_CONCURRENCY_HEAVY=2 \
           -e WORKER_CONCURRENCY_FAST=2 \
           -v /data/audiobooks:/data/audiobooks \
           audiobook-worker
```

---

## Monitoring & Debugging

### View Job Status

```javascript
// All jobs
db.jobs.find().pretty();

// Running now
db.jobs.find({ status: "running" }).count();

// Failed jobs
db.jobs.find({ status: "failed" }).pretty();

// Retrying soon
db.jobs.find({ status: "retrying", runAfter: { $lte: new Date() } }).count();

// Stuck jobs (locked, but not updating)
db.jobs
  .find({
    status: "running",
    lockedAt: { $lt: new Date(Date.now() - 30 * 60000) }, // Older than 30 min
  })
  .pretty();
```

### Manual Job Recovery

```javascript
// Unlock a stuck job
db.jobs.updateOne(
  { _id: ObjectId("...") },
  { $set: { status: "queued", lockedBy: null, lockedAt: null } },
);

// Retry a failed job
db.jobs.updateOne(
  { _id: ObjectId("...") },
  {
    $set: {
      status: "queued",
      attempt: 1,
      maxAttempts: 3,
      runAfter: new Date(),
    },
  },
);

// Cancel a queued job
db.jobs.deleteOne({ _id: ObjectId("...") });
```

### Common Issues

| Problem                 | Check                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Jobs not progressing    | Is worker running? Check `MONGO_URI` connectivity                                          |
| Long poll intervals     | Check `WORKER_POLL_MS` setting (default 1.5s)                                              |
| Jobs stuck in "running" | Check `lockedAt` timestamp; worker may have crashed                                        |
| High CPU                | Limit `WORKER_CONCURRENCY_HEAVY` / `WORKER_CONCURRENCY_FAST` or increase `heavyJobDelayMs` |
| Disk full               | Monitor `/data/audiobooks/` and `/uploads/` sizes                                          |

---

## Architecture Notes

### Atomic Operations

All critical operations use MongoDB atomic updates to prevent race conditions:

- Job claiming (`findOneAndUpdate`)
- Status transitions (using `$set` with multiple fields)
- File operations (atomic rename after safe write)

### Memory Efficiency

- FFmpeg processes spawn and exit (don't accumulate)
- File streaming avoids loading entire files into memory
- SHA256 computed via stream hash (constant memory)

### Error Handling

- All errors serialized to strings and stored in `job.error`
- Unhandled exceptions caught and converted to job failures
- Graceful shutdown waits for in-flight jobs to complete

---

## Related Documentation

- [Job Queue API Endpoints](../api/jobs-endpoints.md)
- [API & Worker Integration](../platform/api-worker-integration.md)
- [FFmpeg Metadata Guide](../ffmpeg/metadata-chapters-guide.md)
