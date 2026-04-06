import path from "path";
import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import { FileService } from "../services/file.service.js";
import { MetadataService } from "../services/metadata.service.js";
import { computeFileSha256, formatSha256 } from "../services/checksum.service.js";
import { atomicWriteFile } from "../utils/atomic-write.js";

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
}

export async function handleIngestJob(job: JobDocument): Promise<void> {
  const payload = job.payload as IngestJobPayload;

  if (!payload.sourcePath) {
    throw new Error("ingest_payload_invalid: missing sourcePath");
  }

  const sourcePath = payload.sourcePath;
  const sourceExists = await fileService.exists(sourcePath);

  if (!sourceExists) {
    throw new Error(`ingest_source_not_found: ${sourcePath}`);
  }

  console.info("ingest job started", {
    jobId: String(job._id),
    sourcePath,
  });

  // -----------------------------------------------
  // 1. Probe file and extract basic metadata
  // -----------------------------------------------
  const probeInfo = await ffmpeg.probeFile(sourcePath);

  console.info("ingest: file probed", {
    jobId: String(job._id),
    duration: probeInfo.duration,
    format: probeInfo.format,
  });

  // -----------------------------------------------
  // 2. Compute checksum
  // -----------------------------------------------
  const checksumHex = await computeFileSha256(sourcePath);
  const checksum = formatSha256(checksumHex);

  console.info("ingest: checksum computed", {
    jobId: String(job._id),
    checksum,
  });

  // -----------------------------------------------
  // 3. Extract and parse metadata from M4B
  // -----------------------------------------------
  const metadataPath = `/tmp/metadata-${job._id}.txt`;

  try {
    await ffmpeg.extractMetadata(sourcePath, metadataPath);

    const extractedMetadata = await metadataService.parseFFmetadata(
      metadataPath,
    );

    console.info("ingest: metadata extracted", {
      jobId: String(job._id),
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
      series: extractedMetadata.album || null,
      duration: Math.round(probeInfo.duration),
      chapters: extractedMetadata.chapters,
      genre: "Audiobook",
      language: "en",
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
        status: "in_progress",
        lastReadAt: new Date(),
        lastWriteAt: new Date(),
      },
      version: 1,
      lastScannedAt: new Date(),
    });

    const bookDir = path.join(AUDIOBOOKS_PATH, String(bookId));

    await fileService.createDirIfNeeded(bookDir);

    console.info("ingest: book directory created", {
      jobId: String(job._id),
      bookId: String(bookId),
      bookDir,
    });

    // -----------------------------------------------
    // 5. Copy audio file to final location
    // -----------------------------------------------
    const audioPath = path.join(bookDir, "audio.m4b");
    await atomicWriteFile(audioPath, sourcePath);

    console.info("ingest: audio file copied", {
      jobId: String(job._id),
      audioPath,
    });

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

        console.info("ingest: cover extracted", {
          jobId: String(job._id),
          coverPath,
        });
      }
    } catch (error) {
      console.warn("ingest: cover extraction failed (non-fatal)", {
        jobId: String(job._id),
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

    console.info("ingest job completed", {
      jobId: String(job._id),
      bookId: String(bookId),
      title: extractedMetadata.title || "Unknown Title",
      author: extractedMetadata.artist || "Unknown Author",
      duration: Math.round(probeInfo.duration),
      checksum,
    });
  } finally {
    // Clean up temporary metadata file
    try {
      await fileService.deleteFile(metadataPath);
    } catch {
      /* ignore cleanup errors */
    }
  }
}
