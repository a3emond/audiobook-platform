import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { type Request, type Response } from "express";

import { JobService } from "../jobs/job.service.js";
import { AdminService } from "./admin.service.js";
import { ApiError } from "../../utils/api-error.js";
import type { UploadBookResponseDTO } from "../../dto/admin.dto.js";
import { BookService } from "../books/book.service.js";

const AUDIOBOOKS_PATH = process.env.AUDIOBOOKS_PATH || "/data/audiobooks";
const UPLOADS_DIR = path.join(AUDIOBOOKS_PATH, "_uploads");
const ALLOWED_EXTENSIONS = new Set([".m4b", ".m4a", ".mp3", ".ogg", ".wav"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function sanitizeFilename(filename: string): string {
	return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function persistUploadFile(file: Express.Multer.File, allowed: Set<string>) {
	const originalName = sanitizeFilename(file.originalname || "upload");
	const ext = path.extname(originalName).toLowerCase();
	if (!allowed.has(ext)) {
		throw new ApiError(400, "upload_unsupported_format");
	}

	await fs.mkdir(UPLOADS_DIR, { recursive: true });

	const filename = `${Date.now()}-${randomUUID()}${ext}`;
	const targetPath = path.join(UPLOADS_DIR, filename);
	await fs.writeFile(targetPath, file.buffer);
	return { targetPath, ext };
}

export class AdminController {
	static async getOverview(_req: Request, res: Response) {
		const result = await AdminService.getOverview();
		res.status(200).json(result);
	}

	static async getCoverage(_req: Request, res: Response) {
		const result = AdminService.getCoverage();
		res.status(200).json(result);
	}

	static async uploadBook(
		req: Request & { file?: Express.Multer.File },
		res: Response<UploadBookResponseDTO>,
	) {
		const file = req.file;
		if (!file) {
			throw new ApiError(400, "upload_file_required");
		}

		const { targetPath } = await persistUploadFile(file, ALLOWED_EXTENSIONS);

		const job = await JobService.enqueueJob(
			"INGEST",
			{ sourcePath: targetPath, cleanupSource: true },
			3,
		);

		res.status(201).json({ jobId: job.id });
	}

	static async uploadMp3Book(
		req: Request<
			unknown,
			unknown,
			{
				title?: string;
				author?: string;
				series?: string;
				genre?: string;
			}
		> & {
			files?:
				| {
						[name: string]: Express.Multer.File[];
				  }
				| Express.Multer.File[];
		},
		res: Response<UploadBookResponseDTO>,
	) {
		const filesByField =
			req.files && !Array.isArray(req.files)
				? req.files
				: undefined;

		const source = filesByField?.file?.[0];
		if (!source) {
			throw new ApiError(400, "upload_file_required");
		}

		const sourcePersisted = await persistUploadFile(source, new Set([".mp3"]));
		const cover = filesByField?.cover?.[0];
		const coverPersisted = cover
			? await persistUploadFile(cover, ALLOWED_IMAGE_EXTENSIONS)
			: null;

		const fallbackTitle = sanitizeFilename(source.originalname || "Untitled")
			.replace(/\.mp3$/i, "")
			.replace(/[_-]+/g, " ")
			.trim();

		const title = req.body.title?.trim() || fallbackTitle || "Unknown Title";
		const author = req.body.author?.trim() || "Unknown Author";
		const series = req.body.series?.trim() || null;
		const genre = req.body.genre?.trim() || null;

		const job = await JobService.enqueueJob(
			"INGEST_MP3_AS_M4B",
			{
				sourcePath: sourcePersisted.targetPath,
				coverPath: coverPersisted?.targetPath ?? null,
				cleanupSource: true,
				cleanupCover: Boolean(coverPersisted),
				metadata: {
					title,
					author,
					series,
					genre,
				},
			},
			3,
		);

		res.status(201).json({ jobId: job.id });
	}

	static async replaceBookCover(
		req: Request<{ bookId?: string }> & { file?: Express.Multer.File },
		res: Response<{ queued: boolean; jobId: string }>,
	) {
		const file = req.file;
		if (!file) {
			throw new ApiError(400, "cover_file_required");
		}

		const { targetPath } = await persistUploadFile(file, ALLOWED_IMAGE_EXTENSIONS);
		const bookId = String(req.params.bookId);
		const jobId = await BookService.enqueueReplaceCover(bookId, targetPath, true);

		res.status(202).json({ queued: true, jobId });
	}
}
