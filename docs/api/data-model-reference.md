# API Data Model Reference

## Purpose

Provide the current source-of-truth MongoDB data model used by the API, including collections, key fields, constraints, indexes, and cross-collection relationships.

## Scope

Included:

- all persisted Mongoose models under `api/src/modules/**/**.model.ts`
- collection names as currently configured
- explicit references (`ref`) and logical relationships
- derived views that are not persisted as standalone collections

Excluded:

- DTO-only shapes
- endpoint-level request/response contracts

Last updated: 2026-04-27

## Data Diagram

- Diagram source: [../diagrams/api-data-model-overview.puml](../diagrams/api-data-model-overview.puml)

## Collections Overview

### users

Model: `UserModel`  
Source: `api/src/modules/users/user.model.ts`

Key fields:

- `email` (unique, indexed)
- `role` (`admin` | `user`, indexed)
- `profile.displayName`
- `profile.preferredLocale` (`fr` | `en`)
- `createdAt`, `updatedAt`

Indexes:

- unique: `email`
- regular: `email`, `role`, `createdAt (-1)`

### auth

Model: `AuthModel`  
Source: `api/src/modules/auth/auth.model.ts`

Key fields:

- `userId` (`ObjectId -> User`, unique, indexed)
- `email` (indexed duplicate for auth lookup)
- `passwordHash` (optional for OAuth-only accounts)
- `providers[]` with `{ type, providerId, linkedAt }`
- `createdAt`, `updatedAt`

Indexes:

- unique: `userId`
- unique sparse compound: `providers.type + providers.providerId`
- regular: `email`

### auth_sessions

Model: `AuthSessionModel`  
Source: `api/src/modules/auth/auth-session.model.ts`

Key fields:

- `userId` (`ObjectId -> User`, indexed)
- `tokenHash` (select:false)
- `device`, `ip`, `userAgent`
- `expiresAt` (TTL)
- `lastUsedAt`
- `createdAt`, `updatedAt`

Indexes:

- TTL: `expiresAt` (`expireAfterSeconds: 0`)
- regular: `userId`, `expiresAt`, `lastUsedAt`, compound `userId + lastUsedAt (-1)`

### books

Model: `BookModel`  
Source: `api/src/modules/books/book.model.ts`

Key fields:

- identity and file state: `filePath` (unique), `checksum`, `version`, `processingState`
- catalog metadata: `title`, `author`, `series`, `seriesIndex`, `genre`, `language`, `duration`
- structure: `chapters[]` (`index`, `title`, `start`, `end`)
- presentation: `coverPath`, `description.{default,fr,en}`
- taxonomy: `tags[]`, `normalizedTags[]`
- metadata control: `overrides.*`, `fileSync.{status,lastReadAt,lastWriteAt}`
- timing: `lastScannedAt`, `createdAt`, `updatedAt`

Indexes:

- unique: `filePath`
- regular: checksum/title/author/series/seriesIndex/language/tags/normalizedTags/genre/lastScannedAt/processingState
- text index: `title`, `author`, `series`, `genre`, `tags`
- compound: `series + seriesIndex + title`
- regular: `createdAt (-1)`, `updatedAt (-1)`

### collections

Model: `CollectionModel`  
Source: `api/src/modules/collections/collection.model.ts`

Key fields:

- `userId` (`ObjectId -> User`)
- `name`
- `bookIds[]` (`ObjectId -> Book`, deduplicated by setter)
- `cover`
- `createdAt`, `updatedAt`

Indexes:

- regular: `userId`, `name`, `createdAt (-1)`, `updatedAt (-1)`
- compound: `userId + name`, `userId + updatedAt (-1)`

### progress

Model: `ProgressModel`  
Source: `api/src/modules/progress/progress.model.ts`

Key fields:

- `userId` (`ObjectId -> User`)
- `bookId` (`ObjectId -> Book`)
- playback state: `positionSeconds`, `lastChapterIndex`, `secondsIntoChapter`
- consistency: `durationAtSave`, `fileChecksumAtSave`, `bookVersionAtSave`
- completion: `completed`, `completedAt`, `manualCompletion`, `lastListenedAt`
- `createdAt`, `updatedAt`

Indexes:

- unique compound: `userId + bookId`
- regular compound: `userId + updatedAt (-1)`
- regular compound: `userId + completed + updatedAt (-1)`

### user_settings

Model: `SettingsModel`  
Source: `api/src/modules/settings/settings.model.ts`

Key fields:

- `userId` (`ObjectId -> User`, unique)
- `locale`
- `player.*` (jump settings, resume rewind rules, playback rate, completion threshold, sleep timer mode)
- `library.showCompleted`
- `updatedAt` (no `createdAt`)

Indexes:

- unique: `userId`

### user_stats

Model: `StatsModel`  
Source: `api/src/modules/stats/stats.model.ts`

Key fields:

- `userId` (`ObjectId -> User`, unique)
- `lifetime.*` aggregate counters and dates
- `rolling.*` (`last7DaysListeningSeconds`, `last30DaysListeningSeconds`)
- `updatedAt` (no `createdAt`)

Indexes:

- unique: `userId`

### listening_sessions

Model: `ListeningSessionModel`  
Source: `api/src/modules/stats/listening-session.model.ts`

Key fields:

- `userId` (`ObjectId -> User`)
- `bookId` (`ObjectId -> Book`)
- session bounds: `startedAt`, `endedAt`
- `listenedSeconds`, `startPositionSeconds`, `endPositionSeconds`
- consistency snapshot: `fileChecksum`, `bookVersion`
- `device` (`web` | `ios` | `android` | `desktop` | `unknown`)

Indexes:

- regular compound: `userId + startedAt (-1)`
- regular compound: `userId + bookId + startedAt (-1)`

### discussion_channels

Model: `DiscussionChannelModel`  
Source: `api/src/modules/discussions/discussion-channel.model.ts`

Key fields:

- `key` (normalized channel key)
- `lang` (`en` | `fr`)
- `title`, `description`
- `isDefault`, `isActive`
- `createdAt`, `updatedAt`

Indexes:

- unique compound: `lang + key`
- regular compound: `lang + isActive + title`

### discussion_messages

Model: `DiscussionMessageModel`  
Source: `api/src/modules/discussions/discussion-message.model.ts`

Key fields:

- `channelKey` + `lang` (logical link to channel)
- `authorUserId` (`ObjectId -> User`)
- `body`
- `replyToMessageId` (`ObjectId -> DiscussionMessage`, optional)
- `createdAt`, `updatedAt`

Indexes:

- regular compound: `lang + channelKey + createdAt (-1)`
- regular: `authorUserId`, `replyToMessageId`

### editorial_blocks

Model: `EditorialBlockModel`  
Source: `api/src/modules/editorial/editorial.model.ts`

Key fields:

- block metadata: `slug` (unique), `scope`, `title`, `subtitle`, `displayType`, `theme`
- lifecycle: `isActive`, `startsAt`, `endsAt`, `sortOrder`, `maxItems`
- `items[]` embedded documents with:
  - `itemType` (`series` | `book`)
  - `target` (logical identifier)
  - `position`, optional `badge`, `kicker`, `customTitle`, `customImage`, scheduling flags
- `createdAt`, `updatedAt`

Indexes:

- unique: `slug`
- regular: `scope`, `isActive`, `startsAt`, `endsAt`, `sortOrder`
- compound: `scope + isActive + sortOrder + updatedAt (-1)`

### jobs

Model: `JobModel`  
Source: `api/src/modules/jobs/job.model.ts`

Key fields:

- `type` (job enum)
- `status` (`queued` | `running` | `retrying` | `done` | `failed`)
- `payload`, `output`, `error` (mixed)
- retries and scheduling: `attempt`, `maxAttempts`, `priority`, `runAfter`
- locking and runtime: `startedAt`, `finishedAt`, `lockedBy`, `lockedAt`
- `createdAt`, `updatedAt`

Indexes:

- compound queue index: `status + runAfter + priority(-1) + createdAt`
- compound history index: `type + createdAt (-1)`
- regular: `status`, `type`, `priority`, `runAfter`, `startedAt`, `finishedAt`, `lockedBy`, `lockedAt`

### jobLogs

Model: `JobLogModel`  
Source: `api/src/modules/jobs/job-log.model.ts`

Key fields:

- `jobId` (`ObjectId -> Job`)
- `timestamp`
- `level` (`debug` | `info` | `warn` | `error`)
- `message`
- `context` (mixed), `duration`
- `createdAt`

Indexes:

- regular compound: `jobId + timestamp`
- regular compound: `level + createdAt (-1)`
- TTL: `createdAt` with retention from `JOB_LOG_RETENTION_DAYS` (default 15 days)

### worker_settings

Model: `WorkerSettingsModel`  
Source: `api/src/modules/jobs/worker-settings.model.ts`

Key fields:

- singleton key: `key` (default `worker`, unique)
- `queue.*` (heavy job types, delays, windowing, concurrency)
- `parity.*` (enabled, interval)
- `taxonomy.*` (enabled, interval)
- `createdAt`, `updatedAt`

Indexes:

- unique: `key`

### admin_audit

Model: `AdminAuditModel`  
Source: `api/src/modules/admin/admin-audit.model.ts`

Key fields:

- `actorUserId` (`ObjectId -> User`)
- request metadata: `method`, `path`, `statusCode`, `requestId`, `ip`, `userAgent`
- optional targets: `targetUserId` (`ObjectId -> User`), `targetBookId` (`ObjectId -> Book`)
- `metadata` (mixed)
- `createdAt`

Indexes:

- regular compound: `actorUserId + createdAt (-1)`
- regular compound: `path + createdAt (-1)`

## Relationship Map

Primary references:

- `auth.userId -> users._id` (1:1)
- `auth_sessions.userId -> users._id` (1:N)
- `user_settings.userId -> users._id` (1:1)
- `user_stats.userId -> users._id` (1:1)
- `progress.userId -> users._id` (N:1)
- `progress.bookId -> books._id` (N:1)
- `collections.userId -> users._id` (N:1)
- `collections.bookIds[] -> books._id` (N:M logical)
- `listening_sessions.userId -> users._id` (N:1)
- `listening_sessions.bookId -> books._id` (N:1)
- `discussion_messages.authorUserId -> users._id` (N:1)
- `discussion_messages.replyToMessageId -> discussion_messages._id` (self-reference)
- `jobLogs.jobId -> jobs._id` (N:1)
- `admin_audit.actorUserId -> users._id` (N:1)
- `admin_audit.targetUserId -> users._id` (optional N:1)
- `admin_audit.targetBookId -> books._id` (optional N:1)

Logical (non-ref) relationships:

- `discussion_messages.(lang, channelKey)` maps to unique `discussion_channels.(lang, key)`
- `editorial_blocks.items[]` targets books or series by logical key/string, not by MongoDB `ObjectId` reference

## Derived and Non-Persisted Domain Views

- Series is derived from the `books` collection (`books.series`, `books.seriesIndex`) and is not stored as a standalone collection.
- Series-level aggregates (book count, authors, genres, tags, duration) are computed in service layer queries.

## Related Docs

- [books-endpoints.md](./books-endpoints.md)
- [series-endpoints.md](./series-endpoints.md)
- [auth-implementation-reference.md](./auth-implementation-reference.md)
- [jobs-endpoints.md](./jobs-endpoints.md)
- [stats-endpoints.md](./stats-endpoints.md)
