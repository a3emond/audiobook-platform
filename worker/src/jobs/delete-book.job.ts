import path from "path";
import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FileService } from "../services/file.service.js";

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
	const payload = job.payload as DeleteBookJobPayload;

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

	console.info("delete-book job started", {
		jobId: String(job._id),
		bookId: payload.bookId,
		deleteFiles: payload.deleteFiles !== false,
	});

	if (payload.deleteFiles !== false) {
		const bookDir = path.join(AUDIOBOOKS_PATH, payload.bookId);
		await fileService.deleteDir(bookDir);
	}

	await booksCollection.deleteOne({ _id: bookId });

	console.info("delete-book job completed", {
		jobId: String(job._id),
		bookId: payload.bookId,
	});

	return {
		bookId: payload.bookId,
		deleted: true,
		filesDeleted: payload.deleteFiles !== false,
	};
}
