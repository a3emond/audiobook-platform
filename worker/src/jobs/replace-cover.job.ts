import path from "path";
import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { computeFileSha256, formatSha256 } from "../services/checksum.service.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import { FileService } from "../services/file.service.js";
import { MetadataService } from "../services/metadata.service.js";
import { atomicWriteFile } from "../utils/atomic-write.js";
import { JobLogger } from "../utils/job-logger.js";

const ffmpeg = new FFmpegService();
const fileService = new FileService();
const metadataService = new MetadataService();

interface ReplaceCoverJobPayload {
	bookId: string;
	sourcePath: string;
	cleanupSource?: boolean;
}

interface BookRecord {
	_id: mongoose.Types.ObjectId;
	filePath: string;
	title?: string | null;
	author?: string | null;
	series?: string | null;
	genre?: string | null;
	chapters?: Array<{ index: number; title: string; start: number; end: number }>;
	coverPath?: string | null;
	version?: number;
}

export async function handleReplaceCoverJob(
	job: JobDocument,
): Promise<Record<string, unknown>> {
	const logger = new JobLogger(String(job._id));
	const payload = job.payload as ReplaceCoverJobPayload;

	if (!payload.bookId || !mongoose.Types.ObjectId.isValid(payload.bookId)) {
		throw new Error("replace_cover_payload_invalid: missing or invalid bookId");
	}
	if (!payload.sourcePath) {
		throw new Error("replace_cover_payload_invalid: missing sourcePath");
	}

	const sourceExists = await fileService.exists(payload.sourcePath);
	if (!sourceExists) {
		throw new Error(`replace_cover_source_not_found:${payload.sourcePath}`);
	}

	const db = mongoose.connection.db;
	if (!db) {
		throw new Error("db_not_connected");
	}

	const bookId = new mongoose.Types.ObjectId(payload.bookId);
	const booksCollection = db.collection<BookRecord>("books");
	const book = await booksCollection.findOne({ _id: bookId });

	if (!book) {
		throw new Error(`replace_cover_book_not_found:${payload.bookId}`);
	}
	if (!book.filePath) {
		throw new Error(`replace_cover_missing_file_path:${payload.bookId}`);
	}

	const audioExists = await fileService.exists(book.filePath);
	if (!audioExists) {
		throw new Error(`replace_cover_audio_not_found:${book.filePath}`);
	}

	logger.info("Replace cover job started", {
		bookId: payload.bookId,
		sourcePath: payload.sourcePath,
		cleanupSource: payload.cleanupSource === true,
	});

	await booksCollection.updateOne(
		{ _id: bookId },
		{
			$set: {
				"fileSync.status": "writing",
				updatedAt: new Date(),
			},
		},
	);

	const metadataPath = `/tmp/replace-cover-metadata-${job._id}.txt`;
	const remuxPath = `/tmp/replace-cover-audio-${job._id}.m4b`;
	const finalCoverPath = path.join(path.dirname(book.filePath), "cover.jpg");

	try {
		await metadataService.writeFFmetadata(metadataPath, {
			title: book.title ?? undefined,
			artist: book.author ?? undefined,
			album: book.series ?? undefined,
			genre: book.genre ?? undefined,
			chapters: book.chapters ?? [],
		});
		logger.debug("Metadata written from DB truth source", {
			chapters: (book.chapters ?? []).length,
		});
		await ffmpeg.remuxWithMetadataAndCover(
			book.filePath,
			metadataPath,
			payload.sourcePath,
			remuxPath,
		);
		logger.debug("Audio remux with new cover completed");
		await atomicWriteFile(book.filePath, remuxPath);
		await atomicWriteFile(finalCoverPath, payload.sourcePath);
		const checksum = formatSha256(await computeFileSha256(book.filePath));
		const duration = Math.round((await ffmpeg.probeFile(book.filePath)).duration);

		await booksCollection.updateOne(
			{ _id: bookId },
			{
				$set: {
					coverPath: finalCoverPath,
					checksum,
					duration,
					"overrides.cover": true,
					"fileSync.status": "in_sync",
					"fileSync.lastWriteAt": new Date(),
					version: Math.max(1, (book.version ?? 1) + 1),
					lastScannedAt: new Date(),
					updatedAt: new Date(),
				},
			},
		);

		logger.info("Replace cover job completed", {
			bookId: payload.bookId,
			coverPath: finalCoverPath,
			checksum,
		});

		return {
			bookId: payload.bookId,
			filePath: book.filePath,
			coverPath: finalCoverPath,
			checksum,
			duration,
		};
	} catch (error) {
		logger.error("Replace cover job failed", {
			bookId: payload.bookId,
			error: error instanceof Error ? error.message : String(error),
		});

		await booksCollection.updateOne(
			{ _id: bookId },
			{
				$set: {
					"fileSync.status": "error",
					updatedAt: new Date(),
				},
			},
		);

		throw error;
	} finally {
		await fileService.deleteFile(metadataPath);
		await fileService.deleteFile(remuxPath);
		if (payload.cleanupSource) {
			await fileService.deleteFile(payload.sourcePath);
			logger.debug("Source cover cleaned up", { sourcePath: payload.sourcePath });
		}
		await logger.persist();
	}
}
