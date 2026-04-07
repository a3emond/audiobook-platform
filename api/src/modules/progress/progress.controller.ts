import { type Response } from "express";

import type {
	CompleteDTO,
	ListProgressQueryDTO,
	SaveProgressDTO,
} from "../../dto/progress.dto.js";
import { ApiError } from "../../utils/api-error.js";
import { type AuthenticatedRequest } from "../../middlewares/auth.middleware.js";
import { ProgressService } from "./progress.service.js";

function requireUserId(req: AuthenticatedRequest): string {
	const userId = req.user?.id;
	if (!userId) {
		throw new ApiError(401, "missing_token");
	}

	return userId;
}

export class ProgressController {
	static async listMine(
		req: AuthenticatedRequest & {
			query: { limit?: string; offset?: string };
		},
		res: Response,
	) {
		const userId = requireUserId(req);
		const query: ListProgressQueryDTO = {
			limit: req.query.limit ? Number(req.query.limit) : undefined,
			offset: req.query.offset ? Number(req.query.offset) : undefined,
		};

		if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100)) {
			throw new ApiError(400, "progress_invalid_limit");
		}

		if (query.offset !== undefined && (!Number.isInteger(query.offset) || query.offset < 0)) {
			throw new ApiError(400, "progress_invalid_offset");
		}

		const result = await ProgressService.listForUser(userId, query);
		res.status(200).json(result);
	}

	static async getMine(req: AuthenticatedRequest, res: Response) {
		const userId = requireUserId(req);
		const result = await ProgressService.getForBook(
			userId,
			String(req.params.bookId),
		);
		res.status(200).json(result);
	}

	static async saveMine(
		req: AuthenticatedRequest & { body: SaveProgressDTO },
		res: Response,
	) {
		const userId = requireUserId(req);
		const result = await ProgressService.saveForBook(
			userId,
			String(req.params.bookId),
			req.body,
		);
		res.status(200).json(result);
	}

	static async completeMine(
		req: AuthenticatedRequest & { body: CompleteDTO },
		res: Response,
	) {
		const userId = requireUserId(req);
		const result = await ProgressService.markCompleted(
			userId,
			String(req.params.bookId),
			req.body,
		);
		res.status(200).json(result);
	}

	static async uncompleteMine(req: AuthenticatedRequest, res: Response) {
		const userId = requireUserId(req);
		const result = await ProgressService.resetCompleted(
			userId,
			String(req.params.bookId),
		);
		res.status(200).json(result);
	}
}
