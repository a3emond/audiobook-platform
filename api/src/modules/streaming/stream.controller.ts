/**
 * HTTP controller for authenticated audio and cover delivery plus resume metadata.
 * Controllers in this API are intentionally thin: they translate Express
 * request data into validated service inputs and choose response status codes,
 * while the real business rules live below in the service/model layer.
 */
import fs from "node:fs";
import { type Response } from "express";

import type { AuthenticatedRequest } from "../../middlewares/auth.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { StreamingService } from "./stream.service.js";

function parseRange(rangeHeader: string, fileSize: number): { start: number; end: number } {
	const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
	if (!match) {
		throw new ApiError(416, "stream_invalid_range");
	}

	const startRaw = match[1];
	const endRaw = match[2];

	if (!startRaw && !endRaw) {
		throw new ApiError(416, "stream_invalid_range");
	}

	let start: number;
	let end: number;

	if (!startRaw && endRaw) {
		// Suffix byte range: bytes=-N
		const suffixLength = Number(endRaw);
		if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
			throw new ApiError(416, "stream_invalid_range");
		}

		end = fileSize - 1;
		start = Math.max(0, fileSize - suffixLength);
	} else {
		start = Number(startRaw);
		end = endRaw ? Number(endRaw) : fileSize - 1;
	}

	if (!Number.isInteger(start) || !Number.isInteger(end)) {
		throw new ApiError(416, "stream_invalid_range");
	}

	if (start < 0 || end < start || start >= fileSize) {
		throw new ApiError(416, "stream_invalid_range");
	}

	if (end >= fileSize) {
		end = fileSize - 1;
	}

	return { start, end };
}

function isNotModified(
	ifNoneMatch: string | undefined,
	ifModifiedSince: string | undefined,
	etag: string,
	lastModified: Date,
): boolean {
	if (ifNoneMatch) {
		const normalized = ifNoneMatch.trim();
		if (normalized === "*" || normalized === etag) {
			return true;
		}
	}

	if (ifModifiedSince) {
		const since = new Date(ifModifiedSince);
		if (!Number.isNaN(since.getTime()) && lastModified.getTime() <= since.getTime()) {
			return true;
		}
	}

	return false;
}

function shouldHonorRange(ifRange: string | undefined, etag: string, lastModified: Date): boolean {
	if (!ifRange) {
		return true;
	}

	if (ifRange.startsWith("W/") || ifRange.startsWith("\"")) {
		return ifRange.trim() === etag;
	}

	const date = new Date(ifRange);
	if (Number.isNaN(date.getTime())) {
		return false;
	}

	return lastModified.getTime() <= date.getTime();
}

export class StreamingController {
	static async getBookCover(
		req: AuthenticatedRequest & { params: { bookId?: string } },
		res: Response,
	) {
		if (!req.user?.id) {
			throw new ApiError(401, 'missing_token');
		}

		const bookId = String(req.params.bookId);
		const { filePath, size, mimeType, etag, lastModified } = await StreamingService.getCoverFileInfo(bookId);

		res.setHeader('ETag', etag);
		res.setHeader('Last-Modified', lastModified.toUTCString());
		res.setHeader('Cache-Control', 'private, max-age=86400');

		if (
			isNotModified(
				typeof req.headers['if-none-match'] === 'string' ? req.headers['if-none-match'] : undefined,
				typeof req.headers['if-modified-since'] === 'string'
					? req.headers['if-modified-since']
					: undefined,
				etag,
				lastModified,
			)
		) {
			res.status(304).end();
			return;
		}

		res.status(200);
		res.setHeader('Content-Length', String(size));
		res.setHeader('Content-Type', mimeType);

		const stream = fs.createReadStream(filePath);
		stream.pipe(res);
	}

	static async getBookAudioHead(
		req: AuthenticatedRequest & { params: { bookId?: string } },
		res: Response,
	) {
		if (!req.user?.id) {
			throw new ApiError(401, "missing_token");
		}

		const bookId = String(req.params.bookId);
		const { size, mimeType, etag, lastModified } = await StreamingService.getAudioFileInfo(bookId);

		res.setHeader("ETag", etag);
		res.setHeader("Last-Modified", lastModified.toUTCString());
		res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");

		if (
			isNotModified(
				typeof req.headers["if-none-match"] === "string" ? req.headers["if-none-match"] : undefined,
				typeof req.headers["if-modified-since"] === "string"
					? req.headers["if-modified-since"]
					: undefined,
				etag,
				lastModified,
			)
		) {
			res.status(304).end();
			return;
		}

		res.status(200);
		res.setHeader("Content-Length", String(size));
		res.setHeader("Content-Type", mimeType);
		res.setHeader("Accept-Ranges", "bytes");
		res.end();
	}

	static async getResumeInfo(
		req: AuthenticatedRequest & { params: { bookId?: string } },
		res: Response,
	) {
		const userId = req.user?.id;
		if (!userId) {
			throw new ApiError(401, "missing_token");
		}

		const bookId = String(req.params.bookId);
		const result = await StreamingService.getResumeInfo(userId, bookId);
		res.status(200).json(result);
	}

	static async streamBookAudio(
		req: AuthenticatedRequest & { params: { bookId?: string } },
		res: Response,
	) {
		if (!req.user?.id) {
			throw new ApiError(401, "missing_token");
		}

		const bookId = String(req.params.bookId);
		const { filePath, size, mimeType, etag, lastModified } = await StreamingService.getAudioFileInfo(bookId);

		res.setHeader("ETag", etag);
		res.setHeader("Last-Modified", lastModified.toUTCString());
		res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");

		if (
			isNotModified(
				typeof req.headers["if-none-match"] === "string" ? req.headers["if-none-match"] : undefined,
				typeof req.headers["if-modified-since"] === "string"
					? req.headers["if-modified-since"]
					: undefined,
				etag,
				lastModified,
			)
		) {
			res.status(304).end();
			return;
		}

		const rangeHeader = req.headers.range;
		const ifRange = typeof req.headers["if-range"] === "string" ? req.headers["if-range"] : undefined;
		if (rangeHeader && shouldHonorRange(ifRange, etag, lastModified)) {
			const { start, end } = parseRange(rangeHeader, size);
			const chunkSize = end - start + 1;

			res.status(206);
			res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
			res.setHeader("Accept-Ranges", "bytes");
			res.setHeader("Content-Length", String(chunkSize));
			res.setHeader("Content-Type", mimeType);

			const stream = fs.createReadStream(filePath, { start, end });
			stream.pipe(res);
			return;
		}

		res.status(200);
		res.setHeader("Content-Length", String(size));
		res.setHeader("Content-Type", mimeType);
		res.setHeader("Accept-Ranges", "bytes");

		const stream = fs.createReadStream(filePath);
		stream.pipe(res);
	}
}
