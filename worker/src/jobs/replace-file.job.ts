import path from "path";
import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import { FileService } from "../services/file.service.js";
import { MetadataService } from "../services/metadata.service.js";
import { computeFileSha256, formatSha256 } from "../services/checksum.service.js";
import { atomicWriteFile } from "../utils/atomic-write.js";

const ffmpeg = new FFmpegService();
const fileService = new FileService();
const metadataService = new MetadataService();

interface ReplaceFileJobPayload {
	bookId: string;
	sourcePath: string;
}

interface BookRecord {
	_id: mongoose.Types.ObjectId;
	filePath: string;
	coverPath?: string | null;
	version?: number;
	title?: string;
	author?: string;
	series?: string | null;
	chapters?: unknown[];
	overrides?: {
		title?: boolean;
		author?: boolean;
		series?: boolean;
		chapters?: boolean;
	};
}

export async function handleReplaceFileJob(
	job: JobDocument,
): Promise<Record<string, unknown>> {
	const payload = job.payload as ReplaceFileJobPayload;

	if (!payload.bookId || !mongoose.Types.ObjectId.isValid(payload.bookId)) {
		throw new Error("replace_file_payload_invalid: missing or invalid bookId");
	}

	if (!payload.sourcePath) {
		throw new Error("replace_file_payload_invalid: missing sourcePath");
	}

	const sourceExists = await fileService.exists(payload.sourcePath);
	if (!sourceExists) {
		throw new Error(`replace_file_source_not_found:${payload.sourcePath}`);
	}

	const db = mongoose.connection.db;
	if (!db) {
		throw new Error("db_not_connected");
	}

	const bookId = new mongoose.Types.ObjectId(payload.bookId);
	const booksCollection = db.collection<BookRecord>("books");
	const book = await booksCollection.findOne({ _id: bookId });

	if (!book) {
		throw new Error(`replace_file_book_not_found:${payload.bookId}`);
	}

	if (!book.filePath) {
		throw new Error(`replace_file_missing_file_path:${payload.bookId}`);
	}

	console.info("replace-file job started", {
		jobId: String(job._id),
		bookId: payload.bookId,
		sourcePath: payload.sourcePath,
		targetPath: book.filePath,
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

	const metadataPath = `/tmp/replace-file-metadata-${job._id}.txt`;
	const coverTmpPath = path.join(path.dirname(book.filePath), `cover.tmp-${job._id}.jpg`);

	try {
		const probeInfo = await ffmpeg.probeFile(payload.sourcePath);
		const checksum = formatSha256(await computeFileSha256(payload.sourcePath));

		await ffmpeg.extractMetadata(payload.sourcePath, metadataPath);
		const extractedMetadata = await metadataService.parseFFmetadata(metadataPath);

		await atomicWriteFile(book.filePath, payload.sourcePath);

		let coverPath = book.coverPath ?? null;
		try {
			await ffmpeg.extractCover(book.filePath, coverTmpPath);
			const hasCover = await fileService.exists(coverTmpPath);
			if (hasCover) {
				const finalCoverPath = path.join(path.dirname(book.filePath), "cover.jpg");
				await fileService.moveFile(coverTmpPath, finalCoverPath);
				coverPath = finalCoverPath;
			}
		} catch (error) {
			console.warn("replace-file cover extraction failed (non-fatal)", {
				jobId: String(job._id),
				bookId: payload.bookId,
				error: error instanceof Error ? error.message : String(error),
			});
		}

		const overrides = book.overrides ?? {};
		const metadataUpdate: Record<string, unknown> = {
			checksum,
			duration: Math.round(probeInfo.duration),
			coverPath,
			"fileSync.status": "in_sync",
			"fileSync.lastReadAt": new Date(),
			"fileSync.lastWriteAt": new Date(),
			version: Math.max(1, (book.version ?? 1) + 1),
			lastScannedAt: new Date(),
			updatedAt: new Date(),
		};

		// Only overwrite fields that have not been manually overridden by an admin
		if (!overrides.title) {
			metadataUpdate.title = extractedMetadata.title || "Unknown Title";
		}
		if (!overrides.author) {
			metadataUpdate.author = extractedMetadata.artist || "Unknown Author";
		}
		if (!overrides.series) {
			metadataUpdate.series = extractedMetadata.album || null;
		}
		if (!overrides.chapters) {
			metadataUpdate.chapters = extractedMetadata.chapters;
		}

		await booksCollection.updateOne(
			{ _id: bookId },
			{ $set: metadataUpdate },
		);

		console.info("replace-file job completed", {
			jobId: String(job._id),
			bookId: payload.bookId,
			checksum,
			duration: Math.round(probeInfo.duration),
		});

		return {
			bookId: payload.bookId,
			filePath: book.filePath,
			sourcePath: payload.sourcePath,
			checksum,
			duration: Math.round(probeInfo.duration),
			chapters: extractedMetadata.chapters.length,
			coverPath,
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
		await fileService.deleteFile(coverTmpPath);
	}
}
