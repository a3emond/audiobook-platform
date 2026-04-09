import path from "path";
import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import { FileService } from "../services/file.service.js";
import { MP3MetadataService } from "../services/mp3-metadata.service.js";
import { computeFileSha256, formatSha256 } from "../services/checksum.service.js";
import { atomicWriteFile } from "../utils/atomic-write.js";
import { normalizeOptionalText } from "../utils/normalize.js";
import { JobLogger } from "../utils/job-logger.js";
import { JOB_PRIORITY_MIN } from "../queue/job.types.js";

const ffmpeg = new FFmpegService();
const fileService = new FileService();
const mp3MetadataService = new MP3MetadataService();

const AUDIOBOOKS_PATH = process.env.AUDIOBOOKS_PATH || "/data/audiobooks";

interface IngestMp3AsM4BPayload {
	sourcePath: string;
	coverPath?: string | null;
	cleanupSource?: boolean;
	cleanupCover?: boolean;
	metadata?: {
		title?: string;
		author?: string;
		series?: string | null;
		genre?: string | null;
		language?: "en" | "fr";
	};
}

interface BookRecord {
	_id: mongoose.Types.ObjectId;
	version?: number;
}

async function createBookDocument(bookData: Record<string, unknown>) {
	const db = mongoose.connection.db;
	if (!db) throw new Error("db_not_connected");
	const booksCollection = db.collection<Record<string, unknown>>("books");
	const result = await booksCollection.insertOne({
		...bookData,
		_id: new mongoose.Types.ObjectId(),
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	return result.insertedId;
}

async function enqueueSanitizeJob(bookId: string, sanitizePriority: number) {
	const db = mongoose.connection.db;
	if (!db) throw new Error("db_not_connected");
	const jobsCollection = db.collection("jobs");
	await jobsCollection.insertOne({
		_id: new mongoose.Types.ObjectId(),
		type: "SANITIZE_MP3_TO_M4B",
		status: "queued",
		priority: sanitizePriority,
		payload: { bookId },
		attempts: 0,
		maxAttempts: 3,
		runAfter: new Date(),
		createdAt: new Date(),
		updatedAt: new Date(),
	});
}

export async function handleIngestMp3AsM4BJob(
	job: JobDocument,
): Promise<Record<string, unknown>> {
	const logger = new JobLogger(String(job._id));
	let jobSuccess = false;

	try {
		const payload = job.payload as IngestMp3AsM4BPayload;
		if (!payload.sourcePath) {
			throw new Error("ingest_mp3_payload_invalid: missing sourcePath");
		}

		logger.info("MP3 ingest started — fast path (will sanitize later)", {
			sourcePath: payload.sourcePath,
			hasCover: !!payload.coverPath,
		});

		const sourceExists = await fileService.exists(payload.sourcePath);
		if (!sourceExists) {
			throw new Error(`ingest_mp3_source_not_found:${payload.sourcePath}`);
		}

		if (payload.coverPath) {
			const coverExists = await fileService.exists(payload.coverPath);
			if (!coverExists) {
				throw new Error(`ingest_mp3_cover_not_found:${payload.coverPath}`);
			}
		}

		// -----------------------------------------------
		// Step 1: Extract MP3 metadata (chapters, tags)
		// -----------------------------------------------
		logger.info("Extracting MP3 metadata");
		const mp3Metadata = await mp3MetadataService.extractMetadata(payload.sourcePath);
		logger.info("MP3 metadata extracted", {
			title: mp3Metadata.title,
			artist: mp3Metadata.artist,
			chapters: mp3Metadata.chapters.length,
		});

		// -----------------------------------------------
		// Step 2: Probe audio file
		// -----------------------------------------------
		logger.info("Probing audio file");
		const probeInfo = await ffmpeg.probeFile(payload.sourcePath);
		const durationMs = Math.max(1000, Math.round(probeInfo.duration * 1000));
		logger.info("Audio file probed", { duration: probeInfo.duration });

		// -----------------------------------------------
		// Step 3: Merge metadata (payload overrides extracted)
		// -----------------------------------------------
		const fallbackTitle = path.basename(payload.sourcePath).replace(/\.[^.]+$/, "");
		const title =
			payload.metadata?.title?.trim() || mp3Metadata.title || fallbackTitle || "Unknown Title";
		const author =
			payload.metadata?.author?.trim() || mp3Metadata.artist || "Unknown Author";
		const series = normalizeOptionalText(payload.metadata?.series || mp3Metadata.album);
		const genre = payload.metadata?.genre?.trim() || mp3Metadata.genre || "Audiobook";
		const language =
			payload.metadata?.language === "fr" || payload.metadata?.language === "en"
				? payload.metadata.language
				: "en";

		// Build preliminary chapter list from id3 tags (single chapter fallback)
		const chapters =
			mp3Metadata.chapters.length > 0
				? mp3Metadata.chapters.map((ch, idx) => ({
						index: idx,
						title: ch.title,
						start: ch.startMs,
						end: ch.endMs,
					}))
				: [{ index: 0, title, start: 0, end: durationMs }];

		logger.info("Metadata merged", { title, author, series, genre, language });

		// -----------------------------------------------
		// Step 4: Compute checksum of source MP3
		// -----------------------------------------------
		logger.info("Computing checksum");
		const checksum = formatSha256(await computeFileSha256(payload.sourcePath));
		logger.info("Checksum computed", { checksum });

		// -----------------------------------------------
		// Step 5: Create book document (pending sanitize)
		// -----------------------------------------------
		logger.info("Creating book document");
		const bookId = await createBookDocument({
			checksum,
			title,
			author,
			series,
			duration: Math.round(probeInfo.duration),
			chapters,
			genre,
			language,
			description: { default: null, fr: null, en: null },
			overrides: {
				title: Boolean(payload.metadata?.title),
				author: Boolean(payload.metadata?.author),
				series: Boolean(payload.metadata?.series),
				seriesIndex: false,
				chapters: false,
				cover: Boolean(payload.coverPath),
				description: false,
			},
			fileSync: { status: "writing", lastReadAt: new Date(), lastWriteAt: new Date() },
			processingState: "pending_sanitize",
			version: 1,
			lastScannedAt: new Date(),
		});
		logger.info("Book document created", { bookId: String(bookId) });

		// -----------------------------------------------
		// Step 6: Copy MP3 to final location
		// -----------------------------------------------
		const bookDir = path.join(AUDIOBOOKS_PATH, String(bookId));
		await fileService.createDirIfNeeded(bookDir);

		const audioPath = path.join(bookDir, "audio.mp3");
		await atomicWriteFile(audioPath, payload.sourcePath);
		logger.info("MP3 copied to book dir", { audioPath });

		// -----------------------------------------------
		// Step 7: Copy cover (if provided)
		// -----------------------------------------------
		let coverPath: string | null = null;
		if (payload.coverPath) {
			coverPath = path.join(bookDir, "cover.jpg");
			await atomicWriteFile(coverPath, payload.coverPath);
			logger.info("Cover file copied", { coverPath });
		}

		// -----------------------------------------------
		// Step 8: Finalize book as available (MP3 version)
		// -----------------------------------------------
		const db = mongoose.connection.db;
		if (!db) throw new Error("db_not_connected");
		const booksCollection = db.collection<BookRecord>("books");
		await booksCollection.updateOne(
			{ _id: bookId },
			{
				$set: {
					filePath: audioPath,
					coverPath,
					fileSync: { status: "in_sync", lastReadAt: new Date(), lastWriteAt: new Date() },
					processingState: "pending_sanitize",
					updatedAt: new Date(),
				},
			},
		);
		logger.info("Book published as MP3 — available for playback now");

		// -----------------------------------------------
		// Step 9: Enqueue deferred sanitize job (low priority)
		// -----------------------------------------------
		const sanitizePriority = JOB_PRIORITY_MIN + 19; // ~20, matches DEFAULT_PRIORITY_BY_TYPE
		await enqueueSanitizeJob(String(bookId), sanitizePriority);
		logger.info("Sanitize job queued", { bookId: String(bookId), priority: sanitizePriority });

		jobSuccess = true;
		logger.info("MP3 ingest completed — book available, sanitize job pending", {
			bookId: String(bookId),
			title,
			author,
			filePath: audioPath,
		});

		return {
			bookId: String(bookId),
			filePath: audioPath,
			coverPath,
			checksum,
			duration: Math.round(probeInfo.duration),
			title,
			author,
			processingState: "pending_sanitize",
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error("MP3 ingest failed", { error: errorMessage });
		throw error;
	} finally {
		const payload = job.payload as IngestMp3AsM4BPayload;
		if (jobSuccess && payload.cleanupSource) {
			await fileService.deleteFile(payload.sourcePath);
			logger.info("Source file cleaned up");
		}
		if (jobSuccess && payload.cleanupCover && payload.coverPath) {
			await fileService.deleteFile(payload.coverPath);
			logger.info("Cover file cleaned up");
		}
		await logger.persist();
	}
}
