/**
 * Core business logic for playback progress persistence and synchronization.
 * In this codebase, services are the place where models, validation results,
 * worker/job coordination, and cross-feature rules come together so controllers
 * remain small and the domain behavior stays testable and reusable.
 */
import mongoose from "mongoose";

import type {
	CompleteDTO,
	ListProgressQueryDTO,
	ListProgressResponseDTO,
	ProgressDTO,
	SaveProgressDTO,
} from "../../dto/progress.dto.js";
import { ApiError } from "../../utils/api-error.js";
import { emitRealtimeEvent } from "../../realtime/realtime.events.js";
import { BookModel } from "../books/book.model.js";
import { ProgressModel, type ProgressDocument } from "./progress.model.js";

function toProgressDTO(progress: ProgressDocument): ProgressDTO {
	return {
		bookId: String(progress.bookId),
		positionSeconds: progress.positionSeconds,
		durationAtSave: progress.durationAtSave,
		lastChapterIndex: progress.lastChapterIndex,
		secondsIntoChapter: progress.secondsIntoChapter,
		completed: progress.completed,
		completedAt: progress.completedAt
			? new Date(progress.completedAt).toISOString()
			: null,
		manualCompletion: progress.manualCompletion,
		lastListenedAt: progress.lastListenedAt
			? new Date(progress.lastListenedAt).toISOString()
			: null,
		createdAt: progress.createdAt ? new Date(progress.createdAt).toISOString() : undefined,
		updatedAt: progress.updatedAt ? new Date(progress.updatedAt).toISOString() : undefined,
	};
}

export class ProgressService {
	static async listForUser(
		userId: string,
		query: ListProgressQueryDTO = {},
	): Promise<ListProgressResponseDTO> {
		const limit = query.limit ?? 20;
		const offset = query.offset ?? 0;

		const filter = { userId };
		const [progresses, total] = await Promise.all([
			ProgressModel.find(filter)
				.sort({ updatedAt: -1 })
				.limit(limit)
				.skip(offset),
			ProgressModel.countDocuments(filter),
		]);

		return {
			progress: progresses.map(toProgressDTO),
			total,
			limit,
			offset,
			hasMore: offset + progresses.length < total,
		};
	}

	static async getForBook(userId: string, bookId: string): Promise<ProgressDTO> {
		if (!mongoose.Types.ObjectId.isValid(bookId)) {
			throw new ApiError(400, "book_invalid_id");
		}

		const progress = await ProgressModel.findOne({ userId, bookId });
		if (!progress) {
			throw new ApiError(404, "progress_not_found");
		}

		return toProgressDTO(progress);
	}

	static async saveForBook(
		userId: string,
		bookId: string,
		data: SaveProgressDTO,
	): Promise<ProgressDTO> {
		if (!mongoose.Types.ObjectId.isValid(bookId)) {
			throw new ApiError(400, "book_invalid_id");
		}

		if (data.positionSeconds < 0 || data.durationAtSave < 0) {
			throw new ApiError(400, "progress_invalid_position");
		}

		const book = await BookModel.findById(bookId);
		if (!book) {
			throw new ApiError(404, "book_not_found");
		}

		const update: Record<string, unknown> = {
			positionSeconds: data.positionSeconds,
			durationAtSave: data.durationAtSave,
			fileChecksumAtSave: book.checksum,
			bookVersionAtSave: book.version,
			lastChapterIndex:
				data.lastChapterIndex !== undefined ? data.lastChapterIndex : null,
			secondsIntoChapter:
				data.secondsIntoChapter !== undefined ? data.secondsIntoChapter : null,
			completed:
				data.durationAtSave > 0
					? data.positionSeconds >= Math.max(0, data.durationAtSave - 20)
					: false,
			lastListenedAt: new Date(),
			updatedAt: new Date(),
		};

		if (update.completed === true) {
			update.completedAt = new Date();
			update.manualCompletion = false;
		} else {
			update.completedAt = null;
			update.manualCompletion = false;
		}

		const progress = await ProgressModel.findOneAndUpdate(
			{ userId, bookId },
			{
				$set: update,
				$setOnInsert: {
					userId,
					bookId,
					createdAt: new Date(),
				},
			},
			{ returnDocument: "after", upsert: true },
		);

		// Broadcast progress update to all user's connected clients
		emitRealtimeEvent("progress.synced", {
			userId,
			bookId,
			positionSeconds: progress.positionSeconds,
			durationAtSave: progress.durationAtSave,
			completed: progress.completed,
			timestamp: new Date().toISOString(),
		});

		return toProgressDTO(progress);
	}

	static async markCompleted(
		userId: string,
		bookId: string,
		data: CompleteDTO,
	): Promise<ProgressDTO> {
		if (!mongoose.Types.ObjectId.isValid(bookId)) {
			throw new ApiError(400, "book_invalid_id");
		}

		const progress = await ProgressModel.findOne({ userId, bookId });
		if (!progress) {
			throw new ApiError(404, "progress_not_found");
		}

		progress.markCompleted(data.manual ?? true);
		progress.updatedAt = new Date();
		await progress.save();

		return toProgressDTO(progress);
	}

	static async resetCompleted(userId: string, bookId: string): Promise<ProgressDTO> {
		if (!mongoose.Types.ObjectId.isValid(bookId)) {
			throw new ApiError(400, "book_invalid_id");
		}

		const progress = await ProgressModel.findOne({ userId, bookId });
		if (!progress) {
			throw new ApiError(404, "progress_not_found");
		}

		progress.markIncomplete();
		progress.updatedAt = new Date();
		await progress.save();

		return toProgressDTO(progress);
	}
}
