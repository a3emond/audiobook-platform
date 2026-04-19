import mongoose from "mongoose";

import {
  JobModel,
  type JobDocument,
  type JobType,
} from "../queue/job.types.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import { FileService } from "../services/file.service.js";
import {
  computeFileSha256,
  formatSha256,
} from "../services/checksum.service.js";
import { hasLikelyChapterTimingMismatch } from "../utils/chapter-timing.js";
import { JobLogger } from "../utils/job-logger.js";

const ffmpeg = new FFmpegService();
const fileService = new FileService();

function parseBooleanEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

const FORCE_CHAPTER_REPAIR_IGNORE_OVERRIDES = parseBooleanEnv(
  "WORKER_CHAPTER_TIMING_REPAIR_IGNORE_OVERRIDES",
  false,
);

interface RescanJobPayload {
  force?: boolean;
  trigger?: string;
}

interface BookRecord {
  _id: mongoose.Types.ObjectId;
  filePath?: string | null;
  checksum?: string | null;
  duration?: number | null;
  chapters?: Array<{
    start: number;
    end: number;
  }>;
  fileSync?: {
    status?: "in_sync" | "dirty" | "writing" | "error";
  };
  processingState?:
    | "ready"
    | "pending_sanitize"
    | "sanitizing"
    | "sanitize_failed";
}

const ACTIVE_JOB_STATUSES = ["queued", "running", "retrying"] as const;

function isReadyM4b(book: BookRecord): boolean {
  return Boolean(
    book.filePath &&
    book.filePath.toLowerCase().endsWith(".m4b") &&
    (book.processingState ?? "ready") === "ready",
  );
}

function isMp3Source(book: BookRecord): boolean {
  return Boolean(book.filePath && book.filePath.toLowerCase().endsWith(".mp3"));
}

async function hasActiveBookJob(
  type: JobType,
  bookId: string,
): Promise<boolean> {
  const existing = await JobModel.exists({
    type,
    status: { $in: ACTIVE_JOB_STATUSES },
    "payload.bookId": bookId,
  });

  return Boolean(existing);
}

async function enqueueBookJob(
  type: JobType,
  payload: Record<string, unknown>,
  priority: number,
): Promise<void> {
  await JobModel.create({
    type,
    status: "queued",
    payload,
    output: null,
    error: null,
    attempt: 0,
    maxAttempts: 3,
    priority,
    runAfter: new Date(),
  });
}

export async function handleRescanJob(
  job: JobDocument,
): Promise<Record<string, unknown>> {
  const logger = new JobLogger(String(job._id));
  const payload = (job.payload as RescanJobPayload) || {};

  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("db_not_connected");
    }

    const booksCollection = db.collection<BookRecord>("books");
    const query =
      payload.force === true ? {} : { "fileSync.status": { $ne: "in_sync" } };
    const books = await booksCollection.find(query).toArray();

    let scanned = 0;
    let updated = 0;
    let missing = 0;
    let errors = 0;
    let drifted = 0;
    let remediated = 0;
    let writeMetadataQueued = 0;
    let sanitizeQueued = 0;
    let skippedExistingRemediation = 0;
    const trigger = payload.trigger || "manual";

    logger.info("Rescan job started", {
      force: payload.force === true,
      trigger,
      targetCount: books.length,
    });

    for (const book of books) {
      scanned += 1;

      if (!book.filePath) {
        errors += 1;
        drifted += 1;
        logger.warn("Book missing filePath during rescan", {
          bookId: String(book._id),
        });
        await booksCollection.updateOne(
          { _id: book._id },
          { $set: { "fileSync.status": "error", updatedAt: new Date() } },
        );
        updated += 1;
        continue;
      }

      try {
        const exists = await fileService.exists(book.filePath);
        if (!exists) {
          missing += 1;
          drifted += 1;
          logger.warn("Book audio file missing during rescan", {
            bookId: String(book._id),
            filePath: book.filePath,
          });
          await booksCollection.updateOne(
            { _id: book._id },
            { $set: { "fileSync.status": "error", updatedAt: new Date() } },
          );
          updated += 1;
          continue;
        }

        const probeInfo = await ffmpeg.probeFile(book.filePath);
        const checksum = formatSha256(await computeFileSha256(book.filePath));
        const duration = Math.round(probeInfo.duration);
        const checksumMismatch = Boolean(
          book.checksum && book.checksum !== checksum,
        );
        const durationMismatch =
          typeof book.duration === "number" &&
          Math.round(book.duration) !== duration;
        const chapterTimingMismatch = hasLikelyChapterTimingMismatch(
          book.chapters ?? [],
          duration * 1000,
        );
        const dirtyStatus = (book.fileSync?.status ?? "in_sync") !== "in_sync";
        const needsSanitize = isMp3Source(book);
        const needsWriteMetadata =
          !needsSanitize &&
          (dirtyStatus ||
            checksumMismatch ||
            durationMismatch ||
            chapterTimingMismatch);
        const now = new Date();

        if (needsSanitize || needsWriteMetadata) {
          drifted += 1;
          await booksCollection.updateOne(
            { _id: book._id },
            {
              $set: {
                "fileSync.status": needsSanitize
                  ? book.fileSync?.status === "error"
                    ? "error"
                    : "dirty"
                  : "dirty",
                "fileSync.lastReadAt": now,
                lastScannedAt: now,
                updatedAt: now,
              },
            },
          );
          updated += 1;

          if (needsSanitize) {
            const bookId = String(book._id);
            if (await hasActiveBookJob("SANITIZE_MP3_TO_M4B", bookId)) {
              skippedExistingRemediation += 1;
              logger.debug(
                "Skipped sanitize enqueue; active job already exists",
                { bookId },
              );
            } else {
              await enqueueBookJob("SANITIZE_MP3_TO_M4B", { bookId }, 20);
              sanitizeQueued += 1;
              remediated += 1;
              logger.info("Queued sanitize remediation", {
                bookId,
                processingState: book.processingState ?? "ready",
              });
            }
          } else if (needsWriteMetadata && isReadyM4b(book)) {
            const bookId = String(book._id);
            if (await hasActiveBookJob("WRITE_METADATA", bookId)) {
              skippedExistingRemediation += 1;
              logger.debug(
                "Skipped metadata remediation enqueue; active job already exists",
                { bookId },
              );
            } else {
              await enqueueBookJob(
                "WRITE_METADATA",
                {
                  bookId,
                  fixChapterTiming: chapterTimingMismatch,
                  forceChapterTimingRepair:
                    chapterTimingMismatch &&
                    FORCE_CHAPTER_REPAIR_IGNORE_OVERRIDES,
                },
                35,
              );
              writeMetadataQueued += 1;
              remediated += 1;
              logger.info("Queued metadata remediation", {
                bookId,
                checksumMismatch,
                durationMismatch,
                chapterTimingMismatch,
                dirtyStatus,
              });
            }
          } else {
            logger.warn(
              "Detected parity drift without direct remediation path",
              {
                bookId: String(book._id),
                processingState: book.processingState ?? "ready",
                filePath: book.filePath,
                checksumMismatch,
                durationMismatch,
                chapterTimingMismatch,
                dirtyStatus,
              },
            );
          }

          continue;
        }

        await booksCollection.updateOne(
          { _id: book._id },
          {
            $set: {
              checksum,
              duration,
              "fileSync.status": "in_sync",
              "fileSync.lastReadAt": now,
              lastScannedAt: now,
              updatedAt: now,
            },
          },
        );

        updated += 1;
        logger.debug("Book rescan refreshed", {
          bookId: String(book._id),
          duration,
        });
      } catch (error) {
        errors += 1;
        drifted += 1;
        await booksCollection.updateOne(
          { _id: book._id },
          { $set: { "fileSync.status": "error", updatedAt: new Date() } },
        );
        updated += 1;

        logger.warn("Failed to refresh book during rescan", {
          bookId: String(book._id),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info("Rescan job completed", {
      scanned,
      updated,
      missing,
      errors,
      drifted,
      remediated,
      writeMetadataQueued,
      sanitizeQueued,
      skippedExistingRemediation,
    });

    return {
      force: payload.force === true,
      trigger,
      targetCount: books.length,
      scanned,
      updated,
      missing,
      errors,
      drifted,
      remediated,
      writeMetadataQueued,
      sanitizeQueued,
      skippedExistingRemediation,
    };
  } catch (error) {
    logger.error("Rescan job failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await logger.persist();
  }
}
