import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import {
	MetadataService,
	type Chapter,
	type Metadata,
} from "../services/metadata.service.js";
import { FileService } from "../services/file.service.js";
import { atomicWriteFile } from "../utils/atomic-write.js";
import { normalizeOptionalText } from "../utils/normalize.js";

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
	const payload = job.payload as WriteMetadataJobPayload;

	if (!payload.bookId || !mongoose.Types.ObjectId.isValid(payload.bookId)) {
		throw new Error("write_metadata_payload_invalid: missing or invalid bookId");
	}

	const hasMetadataChanges =
		payload.title !== undefined ||
		payload.author !== undefined ||
		payload.series !== undefined ||
		payload.genre !== undefined ||
		(payload.chapters !== undefined && payload.chapters.length > 0);

	if (!hasMetadataChanges) {
		throw new Error("write_metadata_payload_invalid: no metadata changes provided");
	}

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

	const exists = await fileService.exists(book.filePath);
	if (!exists) {
		throw new Error(`write_metadata_audio_not_found:${book.filePath}`);
	}

	console.info("write-metadata job started", {
		jobId: String(job._id),
		bookId: payload.bookId,
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

	const metadataPath = `/tmp/write-metadata-${job._id}.txt`;
	const remuxPath = `/tmp/write-metadata-audio-${job._id}.m4b`;

	try {
		await ffmpeg.extractMetadata(book.filePath, metadataPath);
		const existing = await metadataService.parseFFmetadata(metadataPath);

		const merged: Metadata = {
			title:
				payload.title ??
				optionalText(pickBookValue(book, "title", existing.title)),
			artist:
				payload.author ??
				optionalText(pickBookValue(book, "author", existing.artist)),
			album:
				payload.series !== undefined
					? normalizeOptionalText(payload.series) ?? undefined
					: normalizeOptionalText(pickBookValue(book, "series", existing.album)) ?? undefined,
			genre:
				payload.genre !== undefined
					? payload.genre ?? undefined
					: pickBookValue(book, "genre", existing.genre) ?? undefined,
			chapters:
				payload.chapters && payload.chapters.length > 0
					? normalizeChapters(payload.chapters)
					: existing.chapters,
		};

		await metadataService.writeFFmetadata(metadataPath, merged);
		await ffmpeg.remuxWithMetadata(book.filePath, metadataPath, remuxPath);
		await atomicWriteFile(book.filePath, remuxPath);

		await booksCollection.updateOne(
			{ _id: bookId },
			{
				$set: {
					title: merged.title || book.title || "Unknown Title",
					author: merged.artist || book.author || "Unknown Author",
					series: merged.album ?? null,
					genre: merged.genre ?? null,
					chapters: merged.chapters,
					"fileSync.status": "in_sync",
					"fileSync.lastWriteAt": new Date(),
					version: Math.max(1, (book.version ?? 1) + 1),
					lastScannedAt: new Date(),
					updatedAt: new Date(),
				},
			},
		);

		console.info("write-metadata job completed", {
			jobId: String(job._id),
			bookId: payload.bookId,
			chapters: merged.chapters.length,
		});

		return {
			bookId: payload.bookId,
			filePath: book.filePath,
			title: merged.title || book.title || "Unknown Title",
			author: merged.artist || book.author || "Unknown Author",
			series: merged.album ?? null,
			genre: merged.genre ?? null,
			chapters: merged.chapters.length,
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
	}
}
