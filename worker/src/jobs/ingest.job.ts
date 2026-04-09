import path from "path";
import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import { FileService } from "../services/file.service.js";
import { MetadataService } from "../services/metadata.service.js";
import { computeFileSha256, formatSha256 } from "../services/checksum.service.js";
import { atomicWriteFile } from "../utils/atomic-write.js";
import { normalizeOptionalText } from "../utils/normalize.js";
import { JobLogger } from "../utils/job-logger.js";

const ffmpeg = new FFmpegService();
const fileService = new FileService();
const metadataService = new MetadataService();

const AUDIOBOOKS_PATH = process.env.AUDIOBOOKS_PATH || "/data/audiobooks";

async function createBookDocument(bookData: Record<string, unknown>) {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("db_not_connected");
  }

  const booksCollection = db.collection("books");
  const result = await booksCollection.insertOne({
    ...bookData,
    _id: new mongoose.Types.ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return result.insertedId;
}

export interface IngestJobPayload {
  sourcePath: string;
  cleanupSource?: boolean;
  language?: "en" | "fr";
}

export async function handleIngestJob(
  job: JobDocument,
): Promise<Record<string, unknown>> {
  const logger = new JobLogger(String(job._id));
  const payload = job.payload as IngestJobPayload;
  const metadataPath = `/tmp/metadata-${job._id}.txt`;

  try {
    if (!payload.sourcePath) {
      throw new Error("ingest_payload_invalid: missing sourcePath");
    }

    const sourcePath = payload.sourcePath;
    const cleanupSource = payload.cleanupSource === true;
    const language = payload.language === "fr" || payload.language === "en" ? payload.language : "en";
    const sourceExists = await fileService.exists(sourcePath);

    if (!sourceExists) {
      throw new Error(`ingest_source_not_found: ${sourcePath}`);
    }

    logger.info("Ingest job started", { sourcePath });

  // -----------------------------------------------
  // 1. Probe file and extract basic metadata
  // -----------------------------------------------
    const probeInfo = await ffmpeg.probeFile(sourcePath);

    logger.info("Source file probed", { duration: probeInfo.duration, format: probeInfo.format });

  // -----------------------------------------------
  // 2. Compute checksum
  // -----------------------------------------------
    const checksumHex = await computeFileSha256(sourcePath);
    const checksum = formatSha256(checksumHex);

    logger.info("Checksum computed", { checksum });

  // -----------------------------------------------
  // 3. Extract and parse metadata from M4B
  // -----------------------------------------------

    await ffmpeg.extractMetadata(sourcePath, metadataPath);

    const extractedMetadata = await metadataService.parseFFmetadata(
      metadataPath,
    );

    logger.info("Metadata extracted", {
      title: extractedMetadata.title,
      artist: extractedMetadata.artist,
      chapters: extractedMetadata.chapters.length,
    });

    // -----------------------------------------------
    // 4. Create book document and directory
    // -----------------------------------------------
    const bookId = await createBookDocument({
      checksum,
      title: extractedMetadata.title || "Unknown Title",
      author: extractedMetadata.artist || "Unknown Author",
	      series: normalizeOptionalText(extractedMetadata.album),
      duration: Math.round(probeInfo.duration),
      chapters: extractedMetadata.chapters,
      genre: "Audiobook",
      language,
      description: {
        default: null,
        fr: null,
        en: null,
      },
      overrides: {
        title: false,
        author: false,
        series: false,
        seriesIndex: false,
        chapters: false,
        cover: false,
        description: false,
      },
      fileSync: {
        status: "writing",
        lastReadAt: new Date(),
        lastWriteAt: new Date(),
      },
      version: 1,
      lastScannedAt: new Date(),
    });

    const bookDir = path.join(AUDIOBOOKS_PATH, String(bookId));

    await fileService.createDirIfNeeded(bookDir);

    logger.info("Book directory created", {
      bookId: String(bookId),
      bookDir,
    });

    // -----------------------------------------------
    // 5. Copy audio file to final location
    // -----------------------------------------------
    const audioPath = path.join(bookDir, "audio.m4b");
    await atomicWriteFile(audioPath, sourcePath);

    logger.info("Audio file copied", { audioPath });

    // -----------------------------------------------
    // 6. Extract and save cover (if present)
    // -----------------------------------------------
    let coverPath: string | null = null;

    try {
      const tmpCoverPath = path.join(bookDir, "cover.tmp.jpg");
      await ffmpeg.extractCover(audioPath, tmpCoverPath);

      const coverExists = await fileService.exists(tmpCoverPath);

      if (coverExists) {
        coverPath = path.join(bookDir, "cover.jpg");
        await fileService.moveFile(tmpCoverPath, coverPath);

        logger.info("Cover extracted", { coverPath });
      }
    } catch (error) {
      logger.warn("Cover extraction failed (non-fatal)", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // -----------------------------------------------
    // 7. Update book document with final paths
    // -----------------------------------------------
    const db = mongoose.connection.db;
    if (db) {
      const booksCollection = db.collection("books");
      await booksCollection.updateOne(
        { _id: bookId },
        {
          $set: {
            filePath: audioPath,
            coverPath,
            fileSync: {
              status: "in_sync",
              lastReadAt: new Date(),
              lastWriteAt: new Date(),
            },
            updatedAt: new Date(),
          },
        },
      );
    }

    logger.info("Ingest job completed", {
      bookId: String(bookId),
      title: extractedMetadata.title || "Unknown Title",
      author: extractedMetadata.artist || "Unknown Author",
      duration: Math.round(probeInfo.duration),
      checksum,
    });

    if (cleanupSource) {
      try {
        await fileService.deleteFile(sourcePath);
      } catch {
        /* ignore cleanup errors */
      }
    }

    return {
      bookId: String(bookId),
      filePath: audioPath,
      coverPath,
      checksum,
      duration: Math.round(probeInfo.duration),
      title: extractedMetadata.title || "Unknown Title",
      author: extractedMetadata.artist || "Unknown Author",
      chapters: extractedMetadata.chapters.length,
    };
  } catch (error) {
    logger.error("Ingest job failed", {
      error: error instanceof Error ? error.message : String(error),
      sourcePath: payload.sourcePath,
    });
    throw error;
  } finally {
    await fileService.deleteFile(metadataPath).catch(() => undefined);
    await logger.persist();
  }
}
