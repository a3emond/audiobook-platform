/**
 * HTTP controller for listening analytics, session history, and usage reporting.
 * Controllers in this API are intentionally thin: they translate Express
 * request data into validated service inputs and choose response status codes,
 * while the real business rules live below in the service/model layer.
 */
import { type Response } from "express";

import type { AuthenticatedRequest } from "../../middlewares/auth.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import type {
	CreateListeningSessionDTO,
	ListListeningSessionsQueryDTO,
} from "../../dto/session.dto.js";
import { StatsService } from "./stats.service.js";

function requireUserId(req: AuthenticatedRequest): string {
	const userId = req.user?.id;
	if (!userId) {
		throw new ApiError(401, "missing_token");
	}

	return userId;
}

export class StatsController {
	static async getMine(req: AuthenticatedRequest, res: Response) {
		const result = await StatsService.getForUser(requireUserId(req));
		res.status(200).json(result);
	}

	static async listMySessions(
		req: AuthenticatedRequest & {
			query: { bookId?: string; limit?: string; offset?: string };
		},
		res: Response,
	) {
		const query: ListListeningSessionsQueryDTO = {
			bookId: req.query.bookId,
			limit: req.query.limit ? Number(req.query.limit) : undefined,
			offset: req.query.offset ? Number(req.query.offset) : undefined,
		};

		if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100)) {
			throw new ApiError(400, "session_invalid_limit");
		}

		if (query.offset !== undefined && (!Number.isInteger(query.offset) || query.offset < 0)) {
			throw new ApiError(400, "session_invalid_offset");
		}

		const result = await StatsService.listSessionsForUser(requireUserId(req), query);
		res.status(200).json(result);
	}

	static async createMySession(
		req: AuthenticatedRequest & { body: CreateListeningSessionDTO },
		res: Response,
	) {
		const result = await StatsService.recordSessionForUser(
			requireUserId(req),
			req.body,
		);
		res.status(201).json(result);
	}
}
