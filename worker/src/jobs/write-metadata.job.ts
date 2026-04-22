import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import {
  MetadataService,
  type Chapter,
  type Metadata,
} from "../services/metadata.service.js";
import { FileService } from "../services/file.service.js";
import {
  computeFileSha256,
  formatSha256,
} from "../services/checksum.service.js";
import { atomicWriteFile } from "../utils/atomic-write.js";
import { repairChapterTimingScale } from "../utils/chapter-timing.js";
import { normalizeOptionalText } from "../utils/normalize.js";
import { JobLogger } from "../utils/job-logger.js";

const ffmpeg = new FFmpegService();
const metadataService = new MetadataService();
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

interface ChapterPatch {
  title: string;
  startMs: number;
  endMs: number;
}

interface WriteMetadataJobPayload {
  bookId: string;
  chapters?: ChapterPatch[];
  title?: string;
  author?: string;
  series?: string | null;
  genre?: string | null;
  // When true, chapter timestamps are re-extracted from the audio file via ffprobe
  // and used to overwrite the DB chapters (corrects wrong-unit ingestion artifacts).
  // Only applies when the book is a ready M4B and overrides.chapters is false.
  fixChapterTiming?: boolean;
  // When true, metadata remux is explicitly requested to enforce admin cover
  // override for existing content drift detected by parity/rescan checks.
  enforceCoverRemux?: boolean;
  // Emergency migration switch: allows timing repair even when overrides.chapters=true.
  forceChapterTimingRepair?: boolean;
}

interface BookRecord {
  _id: mongoose.Types.ObjectId;
  filePath: string;
  coverPath?: string | null;
  processingState?:
    | "ready"
    | "pending_sanitize"
    | "sanitizing"
    | "sanitize_failed";
  title?: string | null;
  author?: string | null;
  series?: string | null;
  genre?: string | null;
  chapters?: Chapter[];
  overrides?: {
    chapters?: boolean;
    cover?: boolean;
  };
  version?: number;
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function pickBookValue<T>(
  book: BookRecord,
  key: "title" | "author" | "series" | "genre",
  fallback: T,
): T | string | null | undefined {
  if (hasOwn(book, key)) {
    return book[key];
  }

  return fallback;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeChapters(chapters: ChapterPatch[]): Chapter[] {
  return chapters.map((chapter, index) => {
    if (
      !chapter.title ||
      chapter.startMs < 0 ||
      chapter.endMs < chapter.startMs
    ) {
      throw new Error(`write_metadata_invalid_chapter_at_index:${index}`);
    }

    return {
      index,
      title: chapter.title,
      start: chapter.startMs,
      end: chapter.endMs,
    };
  });
}

export async function handleWriteMetadataJob(
  job: JobDocument,
): Promise<Record<string, unknown>> {
  const logger = new JobLogger(String(job._id));
  const payload = job.payload as WriteMetadataJobPayload;
  const metadataPath = `/tmp/write-metadata-${job._id}.txt`;
  const remuxPath = `/tmp/write-metadata-audio-${job._id}.m4b`;

  try {
    if (!payload.bookId || !mongoose.Types.ObjectId.isValid(payload.bookId)) {
      throw new Error(
        "write_metadata_payload_invalid: missing or invalid bookId",
      );
    }

    const hasMetadataChanges =
      payload.title !== undefined ||
      payload.author !== undefined ||
      payload.series !== undefined ||
      payload.genre !== undefined ||
      (payload.chapters !== undefined && payload.chapters.length > 0) ||
      Boolean(payload.fixChapterTiming) ||
      Boolean(payload.enforceCoverRemux);

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("db_not_connected");
    }

    const bookId = new mongoose.Types.ObjectId(payload.bookId);
    const booksCollection = db.collection<BookRecord>("books");
    const book = await booksCollection.findOne({ _id: bookId });

    if (!book) {
      throw new Error(`write_metadata_book_not_found:${payload.bookId}`);
    }

    if (!book.filePath) {
      throw new Error(`write_metadata_missing_file_path:${payload.bookId}`);
    }

    logger.info("Write metadata job started", {
      bookId: payload.bookId,
      filePath: book.filePath,
      processingState: book.processingState ?? "ready",
      enforceCoverRemux: payload.enforceCoverRemux === true,
      syncOnly: !hasMetadataChanges,
    });

    const bypassChapterOverride =
      payload.forceChapterTimingRepair === true ||
      FORCE_CHAPTER_REPAIR_IGNORE_OVERRIDES;
    const chapterOverrideLocked =
      (book.overrides?.chapters ?? false) && !bypassChapterOverride;

    if (bypassChapterOverride && (book.overrides?.chapters ?? false)) {
      logger.warn("Chapter override bypass enabled for timing repair", {
        bookId: payload.bookId,
        source:
          payload.forceChapterTimingRepair === true
            ? "payload"
            : "env:WORKER_CHAPTER_TIMING_REPAIR_IGNORE_OVERRIDES",
      });
    }

    const isM4bFile = book.filePath.toLowerCase().endsWith(".m4b");
    const canRewriteBinary =
      isM4bFile && (book.processingState ?? "ready") === "ready";
    let probedDurationMs: number | null = null;

    const getDurationMs = async (): Promise<number> => {
      if (probedDurationMs === null) {
        probedDurationMs = Math.round(
          (await ffmpeg.probeFile(book.filePath)).duration * 1000,
        );
      }

      return probedDurationMs;
    };

    let existing: Metadata = { chapters: [] };
    if (canRewriteBinary) {
      const exists = await fileService.exists(book.filePath);
      if (!exists) {
        throw new Error(`write_metadata_audio_not_found:${book.filePath}`);
      }

      await booksCollection.updateOne(
        { _id: bookId },
        { $set: { "fileSync.status": "writing", updatedAt: new Date() } },
      );

      await ffmpeg.extractMetadata(book.filePath, metadataPath);
      existing = await metadataService.parseFFmetadata(metadataPath);
    }

    // fixChapterTiming: re-extract chapter timestamps from the binary via ffprobe.
    // ffprobe start_time/end_time are always in seconds, so converting to ms is safe
    // regardless of what TIMEBASE the original file was encoded with.
    let mergedChapters: Chapter[];
    if (payload.chapters && payload.chapters.length > 0) {
      mergedChapters = normalizeChapters(payload.chapters);
    } else if (
      payload.fixChapterTiming &&
      canRewriteBinary &&
      !chapterOverrideLocked
    ) {
      const extracted = await ffmpeg.extractChaptersFromFile(book.filePath);
      if (extracted.length > 0) {
        mergedChapters = extracted.map((ch) => ({
          index: ch.index,
          title: ch.title,
          start: ch.startMs,
          end: ch.endMs,
        }));
        logger.info("Chapter timing re-extracted from binary", {
          bookId: payload.bookId,
          count: mergedChapters.length,
        });
      } else {
        const existingChapters = existing.chapters ?? [];
        const bookChapters = book.chapters ?? [];

        if (existingChapters.length > 0) {
          // Prefer parsed file metadata when fix was requested and ffprobe chapters are missing.
          mergedChapters = existingChapters;
        } else if (bookChapters.length > 0) {
          const durationMs = await getDurationMs();
          const repaired = repairChapterTimingScale(bookChapters, durationMs);

          if (repaired) {
            mergedChapters = repaired.chapters;
            logger.warn(
              "fixChapterTiming fallback repaired chapter scale from DB timing",
              {
                bookId: payload.bookId,
                count: mergedChapters.length,
                scale: repaired.scale,
              },
            );
          } else {
            mergedChapters = bookChapters;
          }
        } else {
          mergedChapters = [];
        }

        logger.warn(
          "fixChapterTiming requested but ffprobe returned no chapters; fallback chapter source used",
          {
            bookId: payload.bookId,
          },
        );
      }
    } else {
      mergedChapters =
        book.chapters && book.chapters.length > 0
          ? book.chapters
          : existing.chapters;
    }

    if (
      canRewriteBinary &&
      !chapterOverrideLocked &&
      (!payload.chapters || payload.chapters.length === 0) &&
      mergedChapters.length > 0
    ) {
      const repaired = repairChapterTimingScale(
        mergedChapters,
        await getDurationMs(),
      );

      if (repaired) {
        mergedChapters = repaired.chapters;
        logger.warn("Chapter timing auto-repaired before remux", {
          bookId: payload.bookId,
          count: mergedChapters.length,
          scale: repaired.scale,
        });
      }
    }

    const merged: Metadata = {
      title:
        payload.title !== undefined
          ? payload.title
          : optionalText(pickBookValue(book, "title", existing.title)),
      artist:
        payload.author !== undefined
          ? payload.author
          : optionalText(pickBookValue(book, "author", existing.artist)),
      album:
        payload.series !== undefined
          ? (normalizeOptionalText(payload.series) ?? undefined)
          : (normalizeOptionalText(
              pickBookValue(book, "series", existing.album),
            ) ?? undefined),
      genre:
        payload.genre !== undefined
          ? (payload.genre ?? undefined)
          : (pickBookValue(book, "genre", existing.genre) ?? undefined),
      chapters: mergedChapters,
    };

    let syncedChecksum: string | null = null;
    let syncedDuration: number | null = null;

    if (canRewriteBinary) {
      await metadataService.writeFFmetadata(metadataPath, merged);

      const shouldEnforceCoverOverride = Boolean(
        book.overrides?.cover && book.coverPath,
      );

      if (shouldEnforceCoverOverride) {
        const coverPath = book.coverPath as string;
        const coverExists = await fileService.exists(coverPath);
        if (coverExists) {
          await ffmpeg.remuxWithMetadataAndCover(
            book.filePath,
            metadataPath,
            coverPath,
            remuxPath,
          );
          logger.info("Audio remuxed with metadata and enforced admin cover", {
            bookId: payload.bookId,
            coverPath,
          });
        } else {
          logger.warn("Cover override active but cover file missing during metadata remux", {
            bookId: payload.bookId,
            coverPath,
          });
          await ffmpeg.remuxWithMetadata(book.filePath, metadataPath, remuxPath);
          logger.info("Audio remuxed with metadata", { bookId: payload.bookId });
        }
      } else {
        await ffmpeg.remuxWithMetadata(book.filePath, metadataPath, remuxPath);
        logger.info("Audio remuxed with metadata", { bookId: payload.bookId });
      }

      await atomicWriteFile(book.filePath, remuxPath);
      syncedChecksum = formatSha256(await computeFileSha256(book.filePath));
      syncedDuration = Math.round(
        (await ffmpeg.probeFile(book.filePath)).duration,
      );
    } else {
      logger.warn("Binary remux deferred: source is not ready M4B", {
        bookId: payload.bookId,
        filePath: book.filePath,
        processingState: book.processingState ?? "ready",
      });
    }

    const nextFileSyncStatus = canRewriteBinary ? "in_sync" : "dirty";
    const now = new Date();
    const updateSet: Record<string, unknown> = {
      title: merged.title || book.title || "Unknown Title",
      author: merged.artist || book.author || "Unknown Author",
      series: merged.album ?? null,
      genre: merged.genre ?? null,
      chapters: merged.chapters,
      "fileSync.status": nextFileSyncStatus,
      "fileSync.lastWriteAt": now,
      version: Math.max(1, (book.version ?? 1) + 1),
      updatedAt: now,
    };

    if (canRewriteBinary) {
      updateSet.checksum = syncedChecksum;
      updateSet.duration = syncedDuration;
      updateSet.lastScannedAt = now;
    }

    await booksCollection.updateOne({ _id: bookId }, { $set: updateSet });

    logger.info("Write metadata completed", {
      bookId: payload.bookId,
      chapters: merged.chapters.length,
      binaryUpdated: canRewriteBinary,
      fileSyncStatus: nextFileSyncStatus,
    });

    return {
      bookId: payload.bookId,
      filePath: book.filePath,
      title: merged.title || book.title || "Unknown Title",
      author: merged.artist || book.author || "Unknown Author",
      series: merged.album ?? null,
      genre: merged.genre ?? null,
      chapters: merged.chapters.length,
      binaryUpdated: canRewriteBinary,
      checksum: syncedChecksum,
      duration: syncedDuration,
    };
  } catch (error) {
    logger.error("Write metadata job failed", {
      bookId: payload.bookId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (payload.bookId && mongoose.Types.ObjectId.isValid(payload.bookId)) {
      const db = mongoose.connection.db;
      if (db) {
        const bookId = new mongoose.Types.ObjectId(payload.bookId);
        await db
          .collection<BookRecord>("books")
          .updateOne(
            { _id: bookId },
            { $set: { "fileSync.status": "error", updatedAt: new Date() } },
          );
      }
    }

    throw error;
  } finally {
    await fileService.deleteFile(metadataPath).catch(() => undefined);
    await fileService.deleteFile(remuxPath).catch(() => undefined);
    await logger.persist();
  }
}
