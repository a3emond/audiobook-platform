import path from "path";
import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FileService } from "../services/file.service.js";
import { JobLogger } from "../utils/job-logger.js";

const fileService = new FileService();
const AUDIOBOOKS_PATH = process.env.AUDIOBOOKS_PATH || "/data/audiobooks";

interface DeleteBookJobPayload {
	bookId: string;
	deleteFiles?: boolean;
}

interface BookRecord {
	_id: mongoose.Types.ObjectId;
	filePath?: string | null;
	coverPath?: string | null;
}

export async function handleDeleteBookJob(
	job: JobDocument,
): Promise<Record<string, unknown>> {
	const logger = new JobLogger(String(job._id));
	const payload = job.payload as DeleteBookJobPayload;

	try {
		if (!payload.bookId || !mongoose.Types.ObjectId.isValid(payload.bookId)) {
			throw new Error("delete_book_payload_invalid: missing or invalid bookId");
		}

		const db = mongoose.connection.db;
		if (!db) {
			throw new Error("db_not_connected");
		}

		const bookId = new mongoose.Types.ObjectId(payload.bookId);
		const booksCollection = db.collection<BookRecord>("books");

		const book = await booksCollection.findOne({ _id: bookId });
		if (!book) {
			throw new Error(`delete_book_not_found:${payload.bookId}`);
		}

		logger.info("Delete book job started", {
			bookId: payload.bookId,
			deleteFiles: payload.deleteFiles !== false,
		});

		if (payload.deleteFiles !== false) {
			const bookDir = path.join(AUDIOBOOKS_PATH, payload.bookId);
			await fileService.deleteDir(bookDir);
			logger.info("Book directory deleted", { bookDir });
		}

		await booksCollection.deleteOne({ _id: bookId });
		logger.info("Book document deleted", { bookId: payload.bookId });

		return {
			bookId: payload.bookId,
			deleted: true,
			filesDeleted: payload.deleteFiles !== false,
		};
	} catch (error) {
		logger.error("Delete book job failed", {
			error: error instanceof Error ? error.message : String(error),
			bookId: payload.bookId,
		});
		throw error;
	} finally {
		await logger.persist();
	}
}
