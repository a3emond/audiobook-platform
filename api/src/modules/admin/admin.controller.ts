import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { type Request, type Response } from "express";

import { JobService } from "../jobs/job.service.js";
import { AdminService } from "./admin.service.js";
import { ApiError } from "../../utils/api-error.js";
import type { UploadBookResponseDTO } from "../../dto/admin.dto.js";

const AUDIOBOOKS_PATH = process.env.AUDIOBOOKS_PATH || "/data/audiobooks";
const UPLOADS_DIR = path.join(AUDIOBOOKS_PATH, "_uploads");
const ALLOWED_EXTENSIONS = new Set([".m4b", ".m4a", ".mp3", ".ogg", ".wav"]);

function sanitizeFilename(filename: string): string {
	return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
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

		const originalName = sanitizeFilename(file.originalname || "upload");
		const ext = path.extname(originalName).toLowerCase();
		if (!ALLOWED_EXTENSIONS.has(ext)) {
			throw new ApiError(400, "upload_unsupported_format");
		}

		await fs.mkdir(UPLOADS_DIR, { recursive: true });

		const filename = `${Date.now()}-${randomUUID()}${ext}`;
		const targetPath = path.join(UPLOADS_DIR, filename);
		await fs.writeFile(targetPath, file.buffer);

		const job = await JobService.enqueueJob(
			"INGEST",
			{ sourcePath: targetPath, cleanupSource: true },
			3,
		);

		res.status(201).json({ jobId: job.id });
	}
}
