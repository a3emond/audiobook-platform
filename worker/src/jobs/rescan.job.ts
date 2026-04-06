import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { FFmpegService } from "../services/ffmpeg.service.js";
import { FileService } from "../services/file.service.js";
import { computeFileSha256, formatSha256 } from "../services/checksum.service.js";

const ffmpeg = new FFmpegService();
const fileService = new FileService();

interface RescanJobPayload {
	force?: boolean;
}

interface BookRecord {
	_id: mongoose.Types.ObjectId;
	filePath?: string | null;
	checksum?: string | null;
	duration?: number | null;
}

export async function handleRescanJob(
	job: JobDocument,
): Promise<Record<string, unknown>> {
	const payload = (job.payload as RescanJobPayload) || {};

	const db = mongoose.connection.db;
	if (!db) {
		throw new Error("db_not_connected");
	}

	const booksCollection = db.collection<BookRecord>("books");
	const query = payload.force === true ? {} : { "fileSync.status": { $ne: "in_sync" } };
	const books = await booksCollection.find(query).toArray();

	let scanned = 0;
	let updated = 0;
	let missing = 0;
	let errors = 0;

	console.info("rescan job started", {
		jobId: String(job._id),
		force: payload.force === true,
		targetCount: books.length,
	});

	for (const book of books) {
		scanned += 1;

		if (!book.filePath) {
			errors += 1;
			await booksCollection.updateOne(
				{ _id: book._id },
				{
					$set: {
						"fileSync.status": "error",
						updatedAt: new Date(),
					},
				},
			);
			continue;
		}

		try {
			const exists = await fileService.exists(book.filePath);
			if (!exists) {
				missing += 1;
				await booksCollection.updateOne(
					{ _id: book._id },
					{
						$set: {
							"fileSync.status": "error",
							updatedAt: new Date(),
						},
					},
				);
				continue;
			}

			const probeInfo = await ffmpeg.probeFile(book.filePath);
			const checksum = formatSha256(await computeFileSha256(book.filePath));

			await booksCollection.updateOne(
				{ _id: book._id },
				{
					$set: {
						checksum,
						duration: Math.round(probeInfo.duration),
						"fileSync.status": "in_sync",
						"fileSync.lastReadAt": new Date(),
						lastScannedAt: new Date(),
						updatedAt: new Date(),
					},
				},
			);

			updated += 1;
		} catch (error) {
			errors += 1;
			await booksCollection.updateOne(
				{ _id: book._id },
				{
					$set: {
						"fileSync.status": "error",
						updatedAt: new Date(),
					},
				},
			);

			console.warn("rescan: failed to refresh book", {
				jobId: String(job._id),
				bookId: String(book._id),
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	console.info("rescan job completed", {
		jobId: String(job._id),
		scanned,
		updated,
		missing,
		errors,
	});

	return {
		force: payload.force === true,
		targetCount: books.length,
		scanned,
		updated,
		missing,
		errors,
	};
}
