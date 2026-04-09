import path from "path";
import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import { FileService } from "../services/file.service.js";
import { MetadataService, type Metadata } from "../services/metadata.service.js";
import { computeFileSha256, formatSha256 } from "../services/checksum.service.js";
import { atomicWriteFile } from "../utils/atomic-write.js";
import { JobLogger } from "../utils/job-logger.js";

const ffmpeg = new FFmpegService();
const fileService = new FileService();
const metadataService = new MetadataService();

const AUDIOBOOKS_PATH = process.env.AUDIOBOOKS_PATH || "/data/audiobooks";

export interface SanitizeMp3Payload {
	bookId: string;
}

interface BookRecord {
	_id: mongoose.Types.ObjectId;
	filePath: string;
	title: string;
	author: string;
	series?: string | null;
	genre?: string | null;
	language?: string;
	chapters?: Array<{ index: number; title: string; start: number; end: number }>;
	coverPath?: string | null;
	processingState?: string;
}

export async function handleSanitizeMp3Job(
	job: JobDocument,
): Promise<Record<string, unknown>> {
	const logger = new JobLogger(String(job._id));

	try {
		const payload = job.payload as SanitizeMp3Payload;
		if (!payload.bookId) {
			throw new Error("sanitize_mp3_payload_invalid: missing bookId");
		}

		logger.info("Sanitize MP3→M4B job started", { bookId: payload.bookId });

		const db = mongoose.connection.db;
		if (!db) throw new Error("db_not_connected");

		const booksCollection = db.collection<BookRecord>("books");
		const objectId = new mongoose.Types.ObjectId(payload.bookId);

		// -----------------------------------------------
		// Step 1: Load book record
		// -----------------------------------------------
		const book = await booksCollection.findOne({ _id: objectId });
		if (!book) {
			throw new Error(`sanitize_mp3_book_not_found:${payload.bookId}`);
		}

		if (!book.filePath || !book.filePath.endsWith(".mp3")) {
			logger.info("Book filePath is already M4B or missing — skipping", {
				filePath: book.filePath,
				processingState: book.processingState,
			});
			// Already converted (race / retry after partial success)
			await booksCollection.updateOne(
				{ _id: objectId },
				{ $set: { processingState: "ready", updatedAt: new Date() } },
			);
			return { bookId: payload.bookId, skipped: true };
		}

		const mp3Path = book.filePath;
		const mp3Exists = await fileService.exists(mp3Path);
		if (!mp3Exists) {
			throw new Error(`sanitize_mp3_source_not_found:${mp3Path}`);
		}

		logger.info("Source MP3 found", { mp3Path });

		// Mark as sanitizing so the UI can show progress
		await booksCollection.updateOne(
			{ _id: objectId },
			{ $set: { processingState: "sanitizing", updatedAt: new Date() } },
		);

		// -----------------------------------------------
		// Step 2: Build FFmetadata for M4B encoding
		// -----------------------------------------------
		const metadataPath = `/tmp/sanitize-metadata-${job._id}.txt`;
		const convertedPath = `/tmp/sanitize-audio-${job._id}.m4b`;

		const chapters = (book.chapters ?? []).length > 0
			? (book.chapters ?? []).map((ch) => ({
					index: ch.index,
					title: ch.title,
					start: ch.start,
					end: ch.end,
				}))
			: [];

		const ffMetadata: Metadata = {
			title: book.title,
			artist: book.author,
			album: book.series ?? undefined,
			genre: book.genre ?? "Audiobook",
			chapters,
		};

		logger.info("Building M4B with chapters", { chapterCount: chapters.length });

		// Flush logs so they're visible during the long encode
		await logger.persist();

		await metadataService.writeFFmetadata(metadataPath, ffMetadata);
		await ffmpeg.buildM4bFromAudio(
			mp3Path,
			metadataPath,
			convertedPath,
			book.coverPath ?? null,
		);

		logger.info("M4B build completed");
		await logger.persist();

		// -----------------------------------------------
		// Step 3: Compute checksum and probe output
		// -----------------------------------------------
		logger.info("Computing checksum");
		const checksum = formatSha256(await computeFileSha256(convertedPath));
		logger.info("Checksum computed", { checksum });

		const convertedProbe = await ffmpeg.probeFile(convertedPath);
		logger.info("M4B probed", { duration: convertedProbe.duration });

		// -----------------------------------------------
		// Step 4: Atomic swap — write M4B to book dir
		// -----------------------------------------------
		const bookDir = path.join(AUDIOBOOKS_PATH, payload.bookId);
		const m4bPath = path.join(bookDir, "audio.m4b");

		await atomicWriteFile(m4bPath, convertedPath);
		logger.info("M4B written to book dir", { m4bPath });

		// -----------------------------------------------
		// Step 5: Update book record — new path + ready state
		// -----------------------------------------------
		await booksCollection.updateOne(
			{ _id: objectId },
			{
				$set: {
					filePath: m4bPath,
					checksum,
					duration: Math.round(convertedProbe.duration),
					fileSync: { status: "in_sync", lastReadAt: new Date(), lastWriteAt: new Date() },
					processingState: "ready",
					updatedAt: new Date(),
				},
			},
		);
		logger.info("Book updated to M4B path", { m4bPath });

		// -----------------------------------------------
		// Step 6: Remove the original MP3
		// -----------------------------------------------
		try {
			await fileService.deleteFile(mp3Path);
			logger.info("Original MP3 removed", { mp3Path });
		} catch (cleanupErr) {
			logger.info("MP3 cleanup failed (non-fatal)", {
				error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
			});
		}

		logger.info("Sanitize job completed", {
			bookId: payload.bookId,
			filePath: m4bPath,
			duration: Math.round(convertedProbe.duration),
		});

		return {
			bookId: payload.bookId,
			filePath: m4bPath,
			checksum,
			duration: Math.round(convertedProbe.duration),
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error("Sanitize MP3→M4B failed", { error: errorMessage });

		// Mark the book so admins can see it failed; MP3 remains playable
		try {
			const db = mongoose.connection.db;
			if (db) {
				const objectId = new mongoose.Types.ObjectId((job.payload as SanitizeMp3Payload).bookId);
				await db.collection("books").updateOne(
					{ _id: objectId },
					{ $set: { processingState: "sanitize_failed", updatedAt: new Date() } },
				);
			}
		} catch {
			/* best-effort */
		}

		throw error;
	} finally {
		await fileService.deleteFile(`/tmp/sanitize-metadata-${job._id}.txt`).catch(() => {});
		await fileService.deleteFile(`/tmp/sanitize-audio-${job._id}.m4b`).catch(() => {});
		await logger.persist();
	}
}
