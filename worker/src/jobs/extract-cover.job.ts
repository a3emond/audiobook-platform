import path from "path";
import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import { FileService } from "../services/file.service.js";

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
	const payload = job.payload as ExtractCoverJobPayload;

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

	if (book.coverPath && payload.force !== true) {
		const coverExists = await fileService.exists(book.coverPath);
		if (coverExists) {
			console.info("extract-cover skipped: cover already exists", {
				jobId: String(job._id),
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
	const tmpCoverPath = path.join(bookDir, `cover.tmp-${job._id}.jpg`);
	const finalCoverPath = path.join(bookDir, "cover.jpg");

	await booksCollection.updateOne(
		{ _id: bookId },
		{
			$set: {
				"fileSync.status": "writing",
				updatedAt: new Date(),
			},
		},
	);

	try {
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

		console.info("extract-cover job completed", {
			jobId: String(job._id),
			bookId: payload.bookId,
			coverPath: finalCoverPath,
		});

		return {
			bookId: payload.bookId,
			coverPath: finalCoverPath,
			skipped: false,
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
		await fileService.deleteFile(tmpCoverPath);
	}
}
