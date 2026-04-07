import fs from "node:fs/promises";
import mongoose from "mongoose";

import { ApiError } from "../../utils/api-error.js";
import { BookModel } from "../books/book.model.js";
import { ProgressModel } from "../progress/progress.model.js";
import { SettingsModel } from "../settings/settings.model.js";

function inferAudioMimeType(filePath: string): string {
	const lower = filePath.toLowerCase();
	if (lower.endsWith(".m4b") || lower.endsWith(".m4a")) {
		return "audio/mp4";
	}
	if (lower.endsWith(".mp3")) {
		return "audio/mpeg";
	}
	if (lower.endsWith(".ogg")) {
		return "audio/ogg";
	}
	if (lower.endsWith(".wav")) {
		return "audio/wav";
	}

	return "application/octet-stream";
}

export class StreamingService {
	static async getAudioFileInfo(bookId: string): Promise<{
		filePath: string;
		size: number;
		mimeType: string;
		lastModified: Date;
		etag: string;
	}> {
		if (!mongoose.Types.ObjectId.isValid(bookId)) {
			throw new ApiError(400, "book_invalid_id");
		}

		const book = await BookModel.findById(bookId);
		if (!book) {
			throw new ApiError(404, "book_not_found");
		}

		if (!book.filePath) {
			throw new ApiError(404, "stream_file_not_found");
		}

		let stat;
		try {
			stat = await fs.stat(book.filePath);
		} catch {
			throw new ApiError(404, "stream_file_not_found");
		}

		if (!stat.isFile()) {
			throw new ApiError(404, "stream_file_not_found");
		}

		return {
			filePath: book.filePath,
			size: stat.size,
			mimeType: inferAudioMimeType(book.filePath),
			lastModified: stat.mtime,
			etag: `W/\"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}\"`,
		};
	}

	static async getResumeInfo(userId: string, bookId: string): Promise<{
		bookId: string;
		streamPath: string;
		positionSeconds: number;
		startSeconds: number;
		durationSeconds: number;
		canResume: boolean;
		appliedRewind: boolean;
	}> {
		if (!mongoose.Types.ObjectId.isValid(userId)) {
			throw new ApiError(400, "user_invalid_id");
		}

		if (!mongoose.Types.ObjectId.isValid(bookId)) {
			throw new ApiError(400, "book_invalid_id");
		}

		const book = await BookModel.findById(bookId);
		if (!book) {
			throw new ApiError(404, "book_not_found");
		}

		const progress = await ProgressModel.findOne({ userId, bookId });
		const settings = await SettingsModel.findOne({ userId });

		const rawPosition = progress?.positionSeconds ?? 0;
		let startSeconds = rawPosition;
		let appliedRewind = false;

		const rewindSettings = settings?.player?.resumeRewind;
		const rewindEnabled = rewindSettings?.enabled ?? true;
		if (progress && rewindEnabled && progress.lastListenedAt) {
			const thresholdSeconds =
				rewindSettings?.thresholdSinceLastListenSeconds ?? 86400;
			const rewindSeconds = rewindSettings?.rewindSeconds ?? 30;
			const secondsSinceLastListen =
				(Date.now() - new Date(progress.lastListenedAt).getTime()) / 1000;

			if (secondsSinceLastListen >= thresholdSeconds) {
				startSeconds = Math.max(0, rawPosition - rewindSeconds);
				appliedRewind = startSeconds !== rawPosition;
			}
		}

		return {
			bookId,
			streamPath: `/streaming/books/${bookId}/audio`,
			positionSeconds: rawPosition,
			startSeconds,
			durationSeconds: book.duration,
			canResume: rawPosition > 0,
			appliedRewind,
		};
	}
}
