import path from "path";
import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import { FileService } from "../services/file.service.js";
import { atomicWriteFile } from "../utils/atomic-write.js";

const ffmpeg = new FFmpegService();
const fileService = new FileService();

interface ReplaceCoverJobPayload {
	bookId: string;
	sourcePath: string;
	cleanupSource?: boolean;
}

interface BookRecord {
	_id: mongoose.Types.ObjectId;
	filePath: string;
	coverPath?: string | null;
	version?: number;
}

export async function handleReplaceCoverJob(
	job: JobDocument,
): Promise<Record<string, unknown>> {
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
		await ffmpeg.extractMetadata(book.filePath, metadataPath);
		await ffmpeg.remuxWithMetadataAndCover(
			book.filePath,
			metadataPath,
			payload.sourcePath,
			remuxPath,
		);
		await atomicWriteFile(book.filePath, remuxPath);
		await atomicWriteFile(finalCoverPath, payload.sourcePath);

		await booksCollection.updateOne(
			{ _id: bookId },
			{
				$set: {
					coverPath: finalCoverPath,
					"overrides.cover": true,
					"fileSync.status": "in_sync",
					"fileSync.lastWriteAt": new Date(),
					version: Math.max(1, (book.version ?? 1) + 1),
					lastScannedAt: new Date(),
					updatedAt: new Date(),
				},
			},
		);

		return {
			bookId: payload.bookId,
			filePath: book.filePath,
			coverPath: finalCoverPath,
		};
	} catch (error) {
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
		}
	}
}
