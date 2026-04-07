# Worker Service — Technical Documentation

## Overview

The **Worker Service** is a job queue system designed to handle long-running, computationally intensive tasks for the audiobook platform. It processes jobs asynchronously using MongoDB as a persistent job store, enabling distributed processing, automatic retries, and graceful failure handling.

### Key Responsibilities

- **Job Processing**: Dequeue and execute jobs with configurable concurrency
- **Audio Ingestion**: Probe M4B files, extract metadata/chapters, compute checksums, create book records
- **File Operations**: Safe atomic writes, file moving, deletion with error recovery
- **FFmpeg Integration**: Wraps FFmpeg for audio probing, metadata extraction, remuxing, cover extraction
- **Metadata Handling**: Parse and generate ffmetadata format for chapter information
- **Reliability**: Exponential backoff retries, distributed locking, graceful shutdown

---

## Architecture

### System Design

```
┌─────────────────┐
│   API Server    │
│   (routes)      │
├─────────────────┤
│  Creates jobs → │ (POST /jobs/enqueue)
│  Polls status ← │ (GET /jobs/{id})
└────────┬────────┘
         │
         │ MongoDB
         │
┌────────▼────────┐
│  Job Queue DB   │ (books.jobs collection)
│  ├─ queued      │
│  ├─ running     │
│  ├─ retrying    │
│  ├─ done        │
│  └─ failed      │
└────────▲────────┘
         │
         │ Polls every WORKER_POLL_MS
         │
┌────────┴────────┐
│ Worker Service  │
├─────────────────┤
│ JobRunner       │ (concurrency control)
│ ├─ JobProcessor │ (state machine)
│ └─ Job Handlers │
│    ├─ ingest    │
│    ├─ extract-cover
│    ├─ write-metadata
│    ├─ rescan    │
│    ├─ replace-file
│    └─ delete-book
├─────────────────┤
│ Services        │
│ ├─ FFmpegService
│ ├─ FileService  │
│ ├─ MetadataService
│ └─ ChecksumService
└─────────────────┘
```

### Job Lifecycle

Each job transitions through states with automatic retry logic:

```
CREATED
  │
  ├─→ queued (waiting for worker to claim)
  │     │
  │     ├─→ running (claimed and executing)
  │     │     │
  │     │     ├─→ done (success) [TERMINAL]
  │     │     │
  │     │     └─→ error (handled by processor)
  │     │           │
  │     │           ├─→ retrying (exponential backoff, attempt < maxAttempts)
  │     │           │     │
  │     │           │     └─→ [back to queued after runAfter time]
  │     │           │
  │     │           └─→ failed (max retries exceeded) [TERMINAL]
  │
  └─→ [direct failure path for validation errors]
```

### State Machine Logic

**JobProcessor.claim()**: 
- Atomically updates job: `status="queued"` → `status="running"`, `lockedBy=workerId`, `lockedAt=now`
- Uses MongoDB one-atomic operation to prevent two workers claiming same job
- Returns true if claim succeeded, false if already claimed by another worker

**JobProcessor.execute()**:
- Calls appropriate handler function for job type
- Times out after 5 minutes per handler (configurable)
- Captures stdout/stderr and handler exceptions

**JobProcessor.retry()**:
- Increments attempt counter
- Calculates backoff: `min(WORKER_RETRY_BASE_MS * 2^(attempt-1), WORKER_RETRY_MAX_MS)`
- Sets `runAfter` timestamp to current time + backoff
- Updates `status="retrying"`
- Job re-enters `queued` status when runAfter timestamp passes

**JobProcessor.fail()**:
- Sets `status="failed"`, `completedAt=now`
- Records final error and attempt count in document
- No further attempts

---

## Core Services

### FFmpegService

Wraps FFmpeg binary with spawned child processes. All FFmpeg operations are isolated and can timeout.

**Constructor**:
```typescript
new FFmpegService(timeoutMs?: number) // Default: 5 minutes (300000 ms)
```

**Methods**:

#### `probeFile(filePath: string): Promise<ProbeInfo>`
Extracts technical metadata about audio file (duration, format, bitrate).

```typescript
const probe = await ffmpeg.probeFile("/data/audiobooks/abc123/audio.m4b");
console.log(probe.duration);   // seconds (float)
console.log(probe.format);     // "m4a", "mp3", etc.
console.log(probe.bitrate);    // kbps (number)
console.log(probe.channels);   // 1 (mono), 2 (stereo), etc.
```

#### `extractMetadata(inputPath: string, outputPath: string): Promise<void>`
Dumps FFmpeg metadata tags to text file in ffmetadata format.

```typescript
await ffmpeg.extractMetadata(
  "/data/audiobooks/abc123/audio.m4b",
  "/tmp/metadata.txt"
);
// Writes ffmetadata format file with: ;FFMETADATA1, title=, artist=, album=, [CHAPTER] sections
```

#### `extractCover(inputPath: string, outputPath: string): Promise<void>`
Extracts first attached image from M4B as JPEG.

```typescript
await ffmpeg.extractCover(
  "/data/audiobooks/abc123/audio.m4b",
  "/data/audiobooks/abc123/cover.jpg"
);
// Throws if no cover image attached
```

#### `remuxWithMetadata(inputPath: string, outputPath: string, metadataPath: string): Promise<void>`
Remuxes audio file while adding chapter information (used for write-metadata job).

```typescript
await ffmpeg.remuxWithMetadata(
  "/data/audiobooks/abc123/audio.m4b",
  "/tmp/audio-with-chapters.m4b",
  "/tmp/ffmetadata.txt"
);
// Outputs new file with embedded metadata/chapters
```

---

### FileService

Safe file operations with error handling and atomic write support.

**Methods**:

#### `exists(filePath: string): Promise<boolean>`
Check if file or directory exists.

#### `createDirIfNeeded(dirPath: string): Promise<void>`
Recursively create directory (equivalent to `mkdir -p`).

#### `copyFile(source: string, target: string): Promise<void>`
Copy file from source to target location.

#### `moveFile(source: string, target: string): Promise<void>`
Move/rename file from source to target.

#### `deleteFile(filePath: string): Promise<void>`
Delete single file. Throws if not found.

#### `deleteDir(dirPath: string): Promise<void>`
Recursively delete directory and all contents.

#### `getFileSize(filePath: string): Promise<number>`
Get file size in bytes.

---

### MetadataService

Parse and generate FFmpeg metadata format (required for chapter information).

**Format Reference**:
```
;FFMETADATA1
title=Book Title Here
artist=Author Name
album=Series Name
[CHAPTER]
TIMEBASE=1/1000
START=0
END=120000
title=Chapter 1
[CHAPTER]
TIMEBASE=1/1000
START=120000
END=300000
title=Chapter 2
```

**Methods**:

#### `parseFFmetadata(filePath: string): Promise<FFmetadata>`
Parse FFmetadata text file and return structured object.

```typescript
const metadata = await metadataService.parseFFmetadata("/tmp/metadata.txt");
// Result:
// {
//   title: "Book Title",
//   artist: "Author Name",
//   album: "Series Name",
//   chapters: [
//     { title: "Chapter 1", startMs: 0, endMs: 120000 },
//     { title: "Chapter 2", startMs: 120000, endMs: 300000 }
//   ]
// }
```

#### `generateFFmetadata(data: FFmetadataInput): Promise<string>`
Generate FFmetadata format string from structured object.

```typescript
const ffmetadataText = await metadataService.generateFFmetadata({
  title: "The Great Gatsby",
  artist: "F. Scott Fitzgerald",
  album: null,
  chapters: [
    { title: "Chapter 1", startMs: 0, endMs: 120000 },
    { title: "Chapter 2", startMs: 120000, endMs: 240000 }
  ]
});
// Returns full ;FFMETADATA1 format string
```

#### `writeFFmetadata(filePath: string, data: FFmetadataInput): Promise<void>`
Write FFmetadata format file to disk.

---

### ChecksumService

Compute SHA256 checksums for file integrity verification.

**Functions**:

#### `computeFileSha256(filePath: string): Promise<string>`
Stream-based SHA256 computation (memory-efficient for large files).

```typescript
const hexDigest = await computeFileSha256("/data/audiobooks/abc123/audio.m4b");
// Returns: "a1b2c3d4e5f6..." (64-char hex string)
```

#### `formatSha256(hexDigest: string): string`
Format SHA256 hex as `sha256:` notation for consistency.

```typescript
const formatted = formatSha256(hexDigest);
// Input:  "a1b2c3d4e5f6..."
// Output: "sha256:a1b2c3d4e5f6..."
```

---

## Job Types and Handlers

### Job Document Schema

```typescript
interface JobDocument {
  _id: ObjectId;
  type: "ingest" | "extract-cover" | "write-metadata" | "rescan" | "replace-file" | "delete-book";
  payload: Record<string, unknown>;
  status: "queued" | "running" | "retrying" | "done" | "failed";
  attempt: number;
  maxAttempts: number;
  runAfter: Date;           // When job can be claimed (for retries)
  lockedBy: string | null;  // Worker ID holding the lock
  lockedAt: Date | null;    // When lock was acquired
  error: string | null;     // Last error message
  output: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}
```

### Ingest Job

**Purpose**: Upload and process new audiobook file

**Payload**:
```typescript
{
  sourcePath: string;  // Full path to M4B file
}
```

**Process**:
1. Probe file for duration and format
2. Compute SHA256 checksum
3. Extract metadata (title, artist, album, chapters)
4. Create Book document in MongoDB (initial state)
5. Create audiobooks directory for book
6. Atomic copy audio file to final location
7. Extract and save cover image (if present)
8. Update Book document with file paths and completion status

**Success Output**:
```typescript
{
  bookId: "507f1f77bcf86cd799439011",
  audioPath: "/data/audiobooks/507f1f77bcf86cd799439011/audio.m4b",
  coverPath: "/data/audiobooks/507f1f77bcf86cd799439011/cover.jpg",
  checksum: "sha256:a1b2c3d4e5f6...",
  metadata: {
    title: "The Great Gatsby",
    artist: "F. Scott Fitzgerald",
    duration: 86400  // seconds
  }
}
```

**Error Scenarios**:
- `ingest_source_not_found`: Source file doesn't exist
- `ingest_payload_invalid`: Missing sourcePath
- `ingest_metadata_parse_failed`: Can't read FFMetadata
- FFmpeg timeout: File too large or corrupted

### Extract Cover Job

**Payload**:
```typescript
{
  bookId: string;
  force?: boolean;
}
```

**Behavior**:
- Loads the book record and validates `filePath`
- Skips if a cover already exists unless `force=true`
- Extracts cover with FFmpeg and writes `cover.jpg`
- Updates `coverPath` and file sync status

**Output**:
```typescript
{
  bookId: string;
  coverPath: string | null;
  skipped: boolean;
  reason?: "cover_already_exists";
}
```

### Write Metadata Job

**Payload**:
```typescript
{
  bookId: string;
  title?: string;
  author?: string;
  series?: string | null;
  genre?: string | null;
  chapters?: Array<{
    title: string;
    startMs: number;
    endMs: number;
  }>;
}
```

**Behavior**:
- Extracts existing ffmetadata from audio
- Merges incoming metadata fields
- Remuxes audio with updated metadata/chapters
- Atomically replaces the original file
- Updates book metadata, chapter list, version, and sync timestamps

**Output**:
```typescript
{
  bookId: string;
  filePath: string;
  title: string;
  author: string;
  series: string | null;
  genre: string | null;
  chapters: number;
}
```

### Replace File Job

**Payload**:
```typescript
{
  bookId: string;
  sourcePath: string;
}
```

**Behavior**:
- Validates replacement source file
- Re-probes duration, checksum, and metadata
- Atomically replaces canonical `audio.m4b`
- Attempts cover extraction and updates book fields

**Output**:
```typescript
{
  bookId: string;
  filePath: string;
  sourcePath: string;
  checksum: string;
  duration: number;
  chapters: number;
  coverPath: string | null;
}
```

### Rescan Job

**Payload**:
```typescript
{
  force?: boolean;
}
```

**Behavior**:
- Scans books from MongoDB (all when `force=true`, otherwise non-in-sync records)
- Verifies file existence
- Recomputes duration/checksum
- Updates sync status and scan timestamps

**Output**:
```typescript
{
  force: boolean;
  targetCount: number;
  scanned: number;
  updated: number;
  missing: number;
  errors: number;
}
```

### Delete Book Job

**Payload**:
```typescript
{
  bookId: string;
  deleteFiles?: boolean;
}
```

**Behavior**:
- Deletes book document from MongoDB
- Optionally deletes on-disk audiobook folder

**Output**:
```typescript
{
  bookId: string;
  deleted: boolean;
  filesDeleted: boolean;
}
```

All job handlers are implemented and return structured `output` payloads persisted on the job document when status is `done`.

---

## Configuration & Environment

### Required Environment Variables

```bash
# MongoDB
MONGO_URL=mongodb://mongo:27017/audiobook

# Worker Queue
WORKER_POLL_MS=5000                 # How often to check for new jobs (milliseconds)
WORKER_CONCURRENCY=2                # Max concurrent jobs to process
WORKER_RETRY_BASE_MS=2000           # Initial retry backoff (exponential: 2s, 4s, 8s, ...)
WORKER_RETRY_MAX_MS=60000           # Max retry backoff (1 minute cap)

# File System
AUDIOBOOKS_PATH=/data/audiobooks    # Host mount point for book files
```

### Optional Configuration

```bash
# FFmpeg timeout (if customizing)
FFMPEG_TIMEOUT_MS=300000            # 5 minutes default
```

---

## Running the Worker

### Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run with nodemon (auto-reload on changes)
npm run dev

# Output:
# > worker@1.0.0 dev
# > nodemon --exec ts-node src/worker.ts
# [worker] connecting to mongodb://localhost:27017/audiobook
# [worker] job runner started with concurrency=2, pollMs=5000
```

### Production

```bash
# Build
npm run build

# Run compiled code
npm start

# With environment variables
MONGO_URL="mongodb://mongo:27017/audiobook" \
WORKER_CONCURRENCY=4 \
WORKER_POLL_MS=3000 \
npm start
```

### Docker Compose

```yaml
services:
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
```

---

## Job Processing Flow

### Step-by-Step Execution

**1. Bootstrap (worker.ts)**
```typescript
// 1. Connect to MongoDB
await mongoose.connect(MONGO_URL);

// 2. Create JobRunner with config
const runner = new JobRunner({
  concurrency: WORKER_CONCURRENCY,    // 2
  pollIntervalMs: WORKER_POLL_MS,     // 5000
  retryBaseMs: WORKER_RETRY_BASE_MS,  // 2000
  retryMaxMs: WORKER_RETRY_MAX_MS,    // 60000
});

// 3. Register job handlers
runner.registerHandler("ingest", handleIngestJob);
runner.registerHandler("extract-cover", handleExtractCoverJob);
// ... etc

// 4. Start processing
runner.start();

// 5. Handle graceful shutdown
process.on("SIGTERM", () => {
  console.info("SIGTERM received, shutting down gracefully");
  runner.stop(); // Allow in-flight jobs to complete
});
```

**2. JobRunner.start() Loop**
```
Every WORKER_POLL_MS:
  1. Query: SELECT * FROM jobs WHERE status='queued' AND runAfter <= now LIMIT concurrency
  2. For each available job:
     a. Try to claim: status='queued' → 'running' (atomic)
     b. If claimed successfully:
        - Get handler function
        - Execute with timeout
        - On success: mark as 'done'
        - On error: check retry logic
          - If attempt < maxAttempts: mark 'retrying', calculate backoff, schedule runAfter
          - If attempt >= maxAttempts: mark 'failed'
     c. If claim failed: another worker got it (skip)
```

**3. Error Handling**
```
Handler throws error:
  ├─ Serialize error to string
  ├─ Check: attempt < maxAttempts?
  │   ├─ YES: exponential backoff retry
  │   │   └─ status='retrying', runAfter=now+backoff, updatedAt=now
  │   └─ NO: final failure
  │       └─ status='failed', completedAt=now
  └─ Log error with context
```

**4. Retry Backoff Calculation**
```
Attempt 1 fails:
  └─ backoff = 2000ms (2 seconds)
  └─ Retry at: now + 2s

Attempt 2 fails:
  └─ backoff = 2000 * 2^(2-1) = 4000ms (4 seconds)
  └─ Retry at: now + 4s

Attempt 3 fails:
  └─ backoff = 2000 * 2^(3-1) = 8000ms (8 seconds)
  └─ Retry at: now + 8s

Attempt 4 fails:
  └─ backoff = min(32000, 60000) = 32000ms (32 seconds)
  └─ Retry at: now + 32s

Attempt 5 fails (maxAttempts=5):
  └─ status='failed' (no more retries)
```

---

## Development Workflow

### Adding a New Job Handler

1. **Create handler file** in `src/jobs/your-job.ts`:
```typescript
import type { JobDocument } from "../queue/job.types.js";

export interface YourJobPayload {
  param1: string;
  param2?: number;
}

export async function handleYourJob(job: JobDocument): Promise<void> {
  const payload = job.payload as YourJobPayload;

  // Validate
  if (!payload.param1) {
    throw new Error("your_job_payload_invalid: missing param1");
  }

  console.info("your job started", {
    jobId: String(job._id),
    param1: payload.param1,
  });

  // Do work here
  // Use services: FFmpegService, FileService, MetadataService, etc.

  console.info("your job completed", {
    jobId: String(job._id),
  });
}
```

2. **Register in worker.ts**:
```typescript
import { handleYourJob } from "./jobs/your-job.js";

// In bootstrap function:
runner.registerHandler("your-job", handleYourJob);
```

3. **Test locally**:
```bash
npm run dev
# In separate terminal, manually insert job into MongoDB:
# db.jobs.insertOne({
#   type: "your-job",
#   payload: { param1: "test" },
#   status: "queued",
#   attempt: 0,
#   maxAttempts: 3,
#   runAfter: new Date(),
#   createdAt: new Date(),
#   updatedAt: new Date()
# })
```

---

## Debugging

### Enable Detailed Logging

Worker uses standard `console.info/warn/error`. To see logs:

```bash
# Development (nodemon)
npm run dev

# Production (add logging middleware if desired)
LOG_LEVEL=debug npm start
```

### Check Job Status

Query MongoDB directly:

```javascript
// See all jobs
db.jobs.find().pretty();

// See running jobs
db.jobs.find({ status: "running" }).pretty();

// See failed jobs
db.jobs.find({ status: "failed" }).pretty();

// See job with specific ID
db.jobs.findOne({ _id: ObjectId("...") });

// See retry attempts
db.jobs.find({ status: "retrying" }).pretty();

// See jobs locked by specific worker
db.jobs.find({ lockedBy: "worker-123" }).pretty();
```

### Common Issues

**Worker not picking up jobs**:
- Check `MONGO_URL` is correct and accessible
- Check `WORKER_POLL_MS` (default 5s, so wait up to 5s)
- Check `status='queued'` and `runAfter <= now` in job document
- Verify no syntax errors with `npm run build`

**Job stuck in "running"**:
- Check `lockedBy` and `lockedAt` fields
- Worker may have crashed without unlocking (no auto-unlock implemented)
- Manually fix: `db.jobs.updateOne({ _id: "..." }, { $set: { status: "queued", lockedBy: null, lockedAt: null } })`

**Job stuck in "retrying"**:
- Check `runAfter` timestamp hasn't passed yet
- Wait for timestamp or manually set to past: `db.jobs.updateOne({ _id: "..." }, { $set: { runAfter: new Date(0) } })`

---

## Performance Considerations

### Memory Usage

- **FFmpeg**: Each probe/extraction spawns a child process (not peak memory intensive)
- **File copying**: Streams data (constant memory regardless of file size)
- **Checksum**: Streams SHA256 computation (constant memory)

### Concurrency Tuning

For the audiobook platform:
- **WORKER_CONCURRENCY=2**: Good starting point (avoid audio processing contention)
- **WORKER_CONCURRENCY=4**: For multi-core machines with SSD storage
- **WORKER_CONCURRENCY=1**: For resource-constrained environments

### Retry Backoff Tuning

Current defaults are conservative:
- **WORKER_RETRY_BASE_MS=2000**: Wait 2s before first retry
- **WORKER_RETRY_MAX_MS=60000**: Cap at 60s (don't hammer on persistent failures)

Adjust based on infrastructure:
- High-frequency failures: Reduce BASE_MS to 500ms
- Avoid load spikes: Increase MAX_MS to 300000ms (5 minutes)

---

## Security Notes

### File Operations

- All file paths validated before operations
- Atomic writes prevent partial/corrupted files
- File cleanup on error prevents disk leaks

### MongoDB Access

- Worker has full read/write to `books.jobs` collection
- Creates documents in `books` collection (for book records)
- Should restrict to app-specific database (not admin)

### FFmpeg

- Spawned with strict timeout (5 minutes default)
- Child process killed on timeout
- stderr captured but not logged (potential info disclosure)
- Consider scanning output for sensitive data before logging

---

## Related Documentation

- [API Integration Points](../api/src/modules/jobs/job.model.ts) — Job document schema
- [Architecture Guide](../docs/Audiobook%20Platform%20—%20Architecture%20&%20Build%20Specification.md)
- [FFmpeg Integration](../docs/M4B%20Metadata%20&%20Chapters%20—%20FFmpeg%20Guide.md)
