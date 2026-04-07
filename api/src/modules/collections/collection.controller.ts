import { type Response } from "express";

import type {
	CreateCollectionDTO,
	ListCollectionsQueryDTO,
	UpdateCollectionDTO,
} from "../../dto/collection.dto.js";
import { type AuthenticatedRequest } from "../../middlewares/auth.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { CollectionService } from "./collection.service.js";

function requireUserId(req: AuthenticatedRequest): string {
	const userId = req.user?.id;
	if (!userId) {
		throw new ApiError(401, "missing_token");
	}

	return userId;
}

export class CollectionController {
	static async listCollections(
		req: AuthenticatedRequest & {
			query: { limit?: string; offset?: string };
		},
		res: Response,
	) {
		const query: ListCollectionsQueryDTO = {
			limit: req.query.limit ? Number(req.query.limit) : undefined,
			offset: req.query.offset ? Number(req.query.offset) : undefined,
		};

		if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100)) {
			throw new ApiError(400, "collection_invalid_limit");
		}

		if (query.offset !== undefined && (!Number.isInteger(query.offset) || query.offset < 0)) {
			throw new ApiError(400, "collection_invalid_offset");
		}

		const result = await CollectionService.listCollections(requireUserId(req), query);
		res.status(200).json(result);
	}

	static async getCollection(
		req: AuthenticatedRequest & { params: { collectionId?: string } },
		res: Response,
	) {
		const result = await CollectionService.getCollectionById(
			requireUserId(req),
			String(req.params.collectionId),
		);
		res.status(200).json(result);
	}

	static async createCollection(
		req: AuthenticatedRequest & { body: CreateCollectionDTO },
		res: Response,
	) {
		const result = await CollectionService.createCollection(
			requireUserId(req),
			req.body,
		);
		res.status(201).json(result);
	}

	static async updateCollection(
		req: AuthenticatedRequest & {
			params: { collectionId?: string };
			body: UpdateCollectionDTO;
		},
		res: Response,
	) {
		const result = await CollectionService.updateCollection(
			requireUserId(req),
			String(req.params.collectionId),
			req.body,
		);
		res.status(200).json(result);
	}

	static async deleteCollection(
		req: AuthenticatedRequest & { params: { collectionId?: string } },
		res: Response,
	) {
		await CollectionService.deleteCollection(
			requireUserId(req),
			String(req.params.collectionId),
		);
		res.status(204).send();
	}
}
