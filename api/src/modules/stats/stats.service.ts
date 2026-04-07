import mongoose from "mongoose";

import type { UserStatsDTO } from "../../dto/stats.dto.js";
import type {
	CreateListeningSessionDTO,
	ListListeningSessionsQueryDTO,
	ListListeningSessionsResponseDTO,
	ListeningSessionDTO,
} from "../../dto/session.dto.js";
import { ApiError } from "../../utils/api-error.js";
import { BookModel } from "../books/book.model.js";
import { ProgressModel } from "../progress/progress.model.js";
import {
	ListeningSessionModel,
	type ListeningSessionDocument,
} from "./listening-session.model.js";
import { StatsModel, type UserStatsDocument } from "./stats.model.js";

function toStatsDTO(stats: UserStatsDocument): UserStatsDTO {
	return {
		lifetime: {
			totalListeningSeconds: stats.lifetime?.totalListeningSeconds ?? 0,
			completedBooksCount: stats.lifetime?.completedBooksCount ?? 0,
			distinctBooksStarted: stats.lifetime?.distinctBooksStarted ?? 0,
			distinctBooksCompleted: stats.lifetime?.distinctBooksCompleted ?? 0,
			totalSessions: stats.lifetime?.totalSessions ?? 0,
			totalSeekCount: stats.lifetime?.totalSeekCount ?? 0,
			totalForwardJumps: stats.lifetime?.totalForwardJumps ?? 0,
			totalBackwardJumps: stats.lifetime?.totalBackwardJumps ?? 0,
			lastListeningAt: stats.lifetime?.lastListeningAt
				? new Date(stats.lifetime.lastListeningAt).toISOString()
				: null,
		},
		rolling: {
			last7DaysListeningSeconds: stats.rolling?.last7DaysListeningSeconds ?? 0,
			last30DaysListeningSeconds: stats.rolling?.last30DaysListeningSeconds ?? 0,
		},
	};
}

function toSessionDTO(session: ListeningSessionDocument): ListeningSessionDTO {
	return {
		id: String(session._id),
		bookId: String(session.bookId),
		startedAt: new Date(session.startedAt).toISOString(),
		endedAt: new Date(session.endedAt).toISOString(),
		listenedSeconds: session.listenedSeconds,
		startPositionSeconds: session.startPositionSeconds,
		endPositionSeconds: session.endPositionSeconds,
		device: session.device,
	};
}

function midnightDaysAgo(days: number): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() - days);
	return d;
}

export class StatsService {
	static async getForUser(userId: string): Promise<UserStatsDTO> {
		if (!mongoose.Types.ObjectId.isValid(userId)) {
			throw new ApiError(400, "user_invalid_id");
		}

		let stats = await StatsModel.findOne({ userId });
		if (!stats) {
			stats = await StatsModel.create({
				userId: new mongoose.Types.ObjectId(userId),
			});
		}

		return toStatsDTO(stats);
	}

	static async listSessionsForUser(
		userId: string,
		query: ListListeningSessionsQueryDTO = {},
	): Promise<ListListeningSessionsResponseDTO> {
		if (!mongoose.Types.ObjectId.isValid(userId)) {
			throw new ApiError(400, "user_invalid_id");
		}

		const limit = query.limit ?? 20;
		const offset = query.offset ?? 0;

		const filter: Record<string, unknown> = { userId };
		if (query.bookId) {
			if (!mongoose.Types.ObjectId.isValid(query.bookId)) {
				throw new ApiError(400, "book_invalid_id");
			}
			filter.bookId = query.bookId;
		}

		const [sessions, total] = await Promise.all([
			ListeningSessionModel.find(filter)
				.sort({ startedAt: -1 })
				.limit(limit)
				.skip(offset),
			ListeningSessionModel.countDocuments(filter),
		]);

		return {
			sessions: sessions.map(toSessionDTO),
			total,
			limit,
			offset,
			hasMore: offset + sessions.length < total,
		};
	}

	static async recordSessionForUser(
		userId: string,
		payload: CreateListeningSessionDTO,
	): Promise<ListeningSessionDTO> {
		if (!mongoose.Types.ObjectId.isValid(userId)) {
			throw new ApiError(400, "user_invalid_id");
		}

		if (!mongoose.Types.ObjectId.isValid(payload.bookId)) {
			throw new ApiError(400, "book_invalid_id");
		}

		const startedAt = new Date(payload.startedAt);
		const endedAt = new Date(payload.endedAt);
		if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
			throw new ApiError(400, "session_invalid_dates");
		}

		if (endedAt < startedAt) {
			throw new ApiError(400, "session_invalid_dates_order");
		}

		if (
			payload.listenedSeconds < 0 ||
			payload.startPositionSeconds < 0 ||
			payload.endPositionSeconds < 0
		) {
			throw new ApiError(400, "session_invalid_positions");
		}

		const book = await BookModel.findById(payload.bookId);
		if (!book) {
			throw new ApiError(404, "book_not_found");
		}

		const session = await ListeningSessionModel.create({
			userId: new mongoose.Types.ObjectId(userId),
			bookId: new mongoose.Types.ObjectId(payload.bookId),
			startedAt,
			endedAt,
			listenedSeconds: payload.listenedSeconds,
			startPositionSeconds: payload.startPositionSeconds,
			endPositionSeconds: payload.endPositionSeconds,
			fileChecksum: book.checksum,
			bookVersion: book.version,
			device: payload.device ?? "web",
		});

		const since7Days = midnightDaysAgo(7);
		const since30Days = midnightDaysAgo(30);

		const [distinctBooksStarted, completedBookIds, last7Agg, last30Agg] =
			await Promise.all([
				ListeningSessionModel.distinct("bookId", { userId }),
				ProgressModel.distinct("bookId", { userId, completed: true }),
				ListeningSessionModel.aggregate<{ total: number }>([
					{ $match: { userId: new mongoose.Types.ObjectId(userId), startedAt: { $gte: since7Days } } },
					{ $group: { _id: null, total: { $sum: "$listenedSeconds" } } },
				]),
				ListeningSessionModel.aggregate<{ total: number }>([
					{ $match: { userId: new mongoose.Types.ObjectId(userId), startedAt: { $gte: since30Days } } },
					{ $group: { _id: null, total: { $sum: "$listenedSeconds" } } },
				]),
			]);

		await StatsModel.findOneAndUpdate(
			{ userId },
			{
				$inc: {
					"lifetime.totalListeningSeconds": payload.listenedSeconds,
					"lifetime.totalSessions": 1,
				},
				$set: {
					"lifetime.lastListeningAt": endedAt,
					"lifetime.completedBooksCount": completedBookIds.length,
					"lifetime.distinctBooksStarted": distinctBooksStarted.length,
					"lifetime.distinctBooksCompleted": completedBookIds.length,
					"rolling.last7DaysListeningSeconds": last7Agg[0]?.total ?? 0,
					"rolling.last30DaysListeningSeconds": last30Agg[0]?.total ?? 0,
					updatedAt: new Date(),
				},
				$setOnInsert: {
					userId: new mongoose.Types.ObjectId(userId),
				},
			},
			{ upsert: true },
		);

		return toSessionDTO(session);
	}
}
