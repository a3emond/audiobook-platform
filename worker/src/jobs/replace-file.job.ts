import path from "path";
import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import { FileService } from "../services/file.service.js";
import { MetadataService } from "../services/metadata.service.js";
import { computeFileSha256, formatSha256 } from "../services/checksum.service.js";
import { atomicWriteFile } from "../utils/atomic-write.js";
import { normalizeOptionalText } from "../utils/normalize.js";
import { JobLogger } from "../utils/job-logger.js";

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
		cover?: boolean;
	};
}

export async function handleReplaceFileJob(
	job: JobDocument,
): Promise<Record<string, unknown>> {
	const logger = new JobLogger(String(job._id));
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

	logger.info("Replace file job started", {
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
	const remuxPath = `/tmp/replace-file-audio-${job._id}.m4b`;

	try {
		const probeInfo = await ffmpeg.probeFile(payload.sourcePath);
		logger.info("Source file analyzed", {
			duration: Math.round(probeInfo.duration),
			checksum: formatSha256(await computeFileSha256(payload.sourcePath)),
		});

		await ffmpeg.extractMetadata(payload.sourcePath, metadataPath);
		const extractedMetadata = await metadataService.parseFFmetadata(metadataPath);

		await atomicWriteFile(book.filePath, payload.sourcePath);

		const overrides = book.overrides ?? {};
		let coverPath = book.coverPath ?? null;
		if (!overrides.cover) {
			try {
				await ffmpeg.extractCover(book.filePath, coverTmpPath);
				const hasCover = await fileService.exists(coverTmpPath);
				if (hasCover) {
					const finalCoverPath = path.join(path.dirname(book.filePath), "cover.jpg");
					await fileService.moveFile(coverTmpPath, finalCoverPath);
					coverPath = finalCoverPath;
					logger.info("Cover refreshed from replacement file", { coverPath });
				}
			} catch (error) {
				logger.warn("Cover extraction failed (non-fatal)", {
					bookId: payload.bookId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		} else {
			logger.info("Cover refresh skipped: manual cover override is active", {
				bookId: payload.bookId,
				coverPath,
			});

			if (coverPath) {
				const coverExists = await fileService.exists(coverPath);
				if (coverExists && book.filePath.toLowerCase().endsWith(".m4b")) {
					await ffmpeg.remuxWithMetadataAndCover(
						book.filePath,
						metadataPath,
						coverPath,
						remuxPath,
					);
					await atomicWriteFile(book.filePath, remuxPath);
					logger.info("Manual cover override reattached to replacement file", {
						bookId: payload.bookId,
						coverPath,
					});
				} else if (!coverExists) {
					logger.warn("Manual cover override active but cover file is missing", {
						bookId: payload.bookId,
						coverPath,
					});
				} else {
					logger.warn("Manual cover override active but replacement target is not M4B", {
						bookId: payload.bookId,
						filePath: book.filePath,
					});
				}
			}
		}

		const finalProbeInfo = await ffmpeg.probeFile(book.filePath);
		const finalChecksum = formatSha256(await computeFileSha256(book.filePath));
		const finalDuration = Math.round(finalProbeInfo.duration);

		const metadataUpdate: Record<string, unknown> = {
			checksum: finalChecksum,
			duration: finalDuration,
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
			metadataUpdate.series = normalizeOptionalText(extractedMetadata.album);
		}
		if (!overrides.chapters) {
			metadataUpdate.chapters = extractedMetadata.chapters;
		}

		await booksCollection.updateOne(
			{ _id: bookId },
			{ $set: metadataUpdate },
		);

		logger.info("Replace file job completed", {
			bookId: payload.bookId,
			checksum: finalChecksum,
			duration: finalDuration,
		});

		return {
			bookId: payload.bookId,
			filePath: book.filePath,
			sourcePath: payload.sourcePath,
			checksum: finalChecksum,
			duration: finalDuration,
			chapters: extractedMetadata.chapters.length,
			coverPath,
		};
	} catch (error) {
		logger.error("Replace file job failed", {
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
		await fileService.deleteFile(coverTmpPath);
		await fileService.deleteFile(remuxPath);
		await logger.persist();
	}
}
