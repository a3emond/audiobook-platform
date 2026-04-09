import path from "path";
import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import { FileService } from "../services/file.service.js";
import { JobLogger } from "../utils/job-logger.js";

const ffmpeg = new FFmpegService();
const fileService = new FileService();

interface ExtractCoverJobPayload {
	bookId: string;
	force?: boolean;
}

interface BookRecord {
	_id: mongoose.Types.ObjectId;
	filePath: string;
	coverPath?: string | null;
}

export async function handleExtractCoverJob(
	job: JobDocument,
): Promise<Record<string, unknown>> {
	const logger = new JobLogger(String(job._id));
	const payload = job.payload as ExtractCoverJobPayload;

	let tmpCoverPath = "";
	try {
		if (!payload.bookId || !mongoose.Types.ObjectId.isValid(payload.bookId)) {
			throw new Error("extract_cover_payload_invalid: missing or invalid bookId");
		}

		const db = mongoose.connection.db;
		if (!db) {
			throw new Error("db_not_connected");
		}

		const bookId = new mongoose.Types.ObjectId(payload.bookId);
		const booksCollection = db.collection<BookRecord>("books");
		const book = await booksCollection.findOne({ _id: bookId });

		if (!book) {
			throw new Error(`extract_cover_book_not_found:${payload.bookId}`);
		}

		if (!book.filePath) {
			throw new Error(`extract_cover_missing_file_path:${payload.bookId}`);
		}

		logger.info("Extract cover job started", {
			bookId: payload.bookId,
			force: payload.force === true,
		});

		if (book.coverPath && payload.force !== true) {
			const coverExists = await fileService.exists(book.coverPath);
			if (coverExists) {
				logger.info("Extract cover skipped: cover already exists", {
					bookId: payload.bookId,
					coverPath: book.coverPath,
				});
				return {
					bookId: payload.bookId,
					coverPath: book.coverPath,
					skipped: true,
					reason: "cover_already_exists",
				};
			}
		}

		const bookDir = path.dirname(book.filePath);
		tmpCoverPath = path.join(bookDir, `cover.tmp-${job._id}.jpg`);
		const finalCoverPath = path.join(bookDir, "cover.jpg");

		await booksCollection.updateOne(
			{ _id: bookId },
			{ $set: { "fileSync.status": "writing", updatedAt: new Date() } },
		);

		await ffmpeg.extractCover(book.filePath, tmpCoverPath);
		const extracted = await fileService.exists(tmpCoverPath);
		if (!extracted) {
			throw new Error(`extract_cover_no_output:${payload.bookId}`);
		}

		await fileService.moveFile(tmpCoverPath, finalCoverPath);
		await booksCollection.updateOne(
			{ _id: bookId },
			{
				$set: {
					coverPath: finalCoverPath,
					"fileSync.status": "in_sync",
					"fileSync.lastWriteAt": new Date(),
					updatedAt: new Date(),
				},
			},
		);

		logger.info("Extract cover completed", {
			bookId: payload.bookId,
			coverPath: finalCoverPath,
		});

		return {
			bookId: payload.bookId,
			coverPath: finalCoverPath,
			skipped: false,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error("Extract cover failed", { bookId: payload.bookId, error: message });

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
		if (tmpCoverPath) {
			await fileService.deleteFile(tmpCoverPath).catch(() => undefined);
		}
		await logger.persist();
	}
}
