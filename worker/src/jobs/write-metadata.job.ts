import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import {
	MetadataService,
	type Chapter,
	type Metadata,
} from "../services/metadata.service.js";
import { FileService } from "../services/file.service.js";
import { computeFileSha256, formatSha256 } from "../services/checksum.service.js";
import { atomicWriteFile } from "../utils/atomic-write.js";
import { normalizeOptionalText } from "../utils/normalize.js";
import { JobLogger } from "../utils/job-logger.js";

const ffmpeg = new FFmpegService();
const metadataService = new MetadataService();
const fileService = new FileService();

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
}

interface BookRecord {
	_id: mongoose.Types.ObjectId;
	filePath: string;
	processingState?: "ready" | "pending_sanitize" | "sanitizing" | "sanitize_failed";
	title?: string | null;
	author?: string | null;
	series?: string | null;
	genre?: string | null;
	chapters?: Chapter[];
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
		if (!chapter.title || chapter.startMs < 0 || chapter.endMs < chapter.startMs) {
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
			throw new Error("write_metadata_payload_invalid: missing or invalid bookId");
		}

		const hasMetadataChanges =
			payload.title !== undefined ||
			payload.author !== undefined ||
			payload.series !== undefined ||
			payload.genre !== undefined ||
			(payload.chapters !== undefined && payload.chapters.length > 0);

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
			syncOnly: !hasMetadataChanges,
		});

		const isM4bFile = book.filePath.toLowerCase().endsWith(".m4b");
		const canRewriteBinary = isM4bFile && (book.processingState ?? "ready") === "ready";

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

		const mergedChapters =
			payload.chapters && payload.chapters.length > 0
				? normalizeChapters(payload.chapters)
				: (book.chapters && book.chapters.length > 0 ? book.chapters : existing.chapters);

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
					? normalizeOptionalText(payload.series) ?? undefined
					: normalizeOptionalText(pickBookValue(book, "series", existing.album)) ?? undefined,
			genre:
				payload.genre !== undefined
					? payload.genre ?? undefined
					: (pickBookValue(book, "genre", existing.genre) ?? undefined),
			chapters: mergedChapters,
		};

		let syncedChecksum: string | null = null;
		let syncedDuration: number | null = null;

		if (canRewriteBinary) {
			await metadataService.writeFFmetadata(metadataPath, merged);
			await ffmpeg.remuxWithMetadata(book.filePath, metadataPath, remuxPath);
			await atomicWriteFile(book.filePath, remuxPath);
			syncedChecksum = formatSha256(await computeFileSha256(book.filePath));
			syncedDuration = Math.round((await ffmpeg.probeFile(book.filePath)).duration);
			logger.info("Audio remuxed with metadata", { bookId: payload.bookId });
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
				await db.collection<BookRecord>("books").updateOne(
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
