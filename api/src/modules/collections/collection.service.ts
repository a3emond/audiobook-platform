import mongoose from "mongoose";

import type {
	CollectionDTO,
	CreateCollectionDTO,
	ListCollectionsQueryDTO,
	ListCollectionsResponseDTO,
	UpdateCollectionDTO,
} from "../../dto/collection.dto.js";
import { ApiError } from "../../utils/api-error.js";
import { BookModel } from "../books/book.model.js";
import {
	CollectionModel,
	type CollectionDocument,
} from "./collection.model.js";

function toCollectionDTO(collection: CollectionDocument): CollectionDTO {
	return {
		id: String(collection._id),
		name: collection.name,
		bookIds: (collection.bookIds ?? []).map((bookId) => String(bookId)),
		cover: collection.cover,
		createdAt: collection.createdAt
			? new Date(collection.createdAt).toISOString()
			: undefined,
		updatedAt: collection.updatedAt
			? new Date(collection.updatedAt).toISOString()
			: undefined,
	};
}

async function validateBookIds(bookIds: string[]): Promise<void> {
	const normalizedBookIds = Array.from(new Set(bookIds));

	for (const bookId of normalizedBookIds) {
		if (!mongoose.Types.ObjectId.isValid(bookId)) {
			throw new ApiError(400, "collection_invalid_book_id");
		}
	}

	if (normalizedBookIds.length === 0) {
		return;
	}

	const count = await BookModel.countDocuments({ _id: { $in: normalizedBookIds } });
	if (count !== normalizedBookIds.length) {
		throw new ApiError(404, "collection_book_not_found");
	}
}

export class CollectionService {
	static async listCollections(
		userId: string,
		query: ListCollectionsQueryDTO = {},
	): Promise<ListCollectionsResponseDTO> {
		const limit = query.limit ?? 20;
		const offset = query.offset ?? 0;
		const filter = { userId };

		const [collections, total] = await Promise.all([
			CollectionModel.find(filter)
				.sort({ updatedAt: -1 })
				.limit(limit)
				.skip(offset),
			CollectionModel.countDocuments(filter),
		]);

		return {
			collections: collections.map(toCollectionDTO),
			total,
			limit,
			offset,
			hasMore: offset + collections.length < total,
		};
	}

	static async getCollectionById(
		userId: string,
		collectionId: string,
	): Promise<CollectionDTO> {
		if (!mongoose.Types.ObjectId.isValid(collectionId)) {
			throw new ApiError(400, "collection_invalid_id");
		}

		const collection = await CollectionModel.findOne({ _id: collectionId, userId });
		if (!collection) {
			throw new ApiError(404, "collection_not_found");
		}

		return toCollectionDTO(collection);
	}

	static async createCollection(
		userId: string,
		data: CreateCollectionDTO,
	): Promise<CollectionDTO> {
		if (!data.name || !data.name.trim()) {
			throw new ApiError(400, "collection_name_required");
		}

		const collection = await CollectionModel.create({
			userId: new mongoose.Types.ObjectId(userId),
			name: data.name.trim(),
			bookIds: [],
			cover: null,
		});

		return toCollectionDTO(collection);
	}

	static async updateCollection(
		userId: string,
		collectionId: string,
		data: UpdateCollectionDTO,
	): Promise<CollectionDTO> {
		if (!mongoose.Types.ObjectId.isValid(collectionId)) {
			throw new ApiError(400, "collection_invalid_id");
		}

		const updates: Record<string, unknown> = {};

		if (data.name !== undefined) {
			if (!data.name.trim()) {
				throw new ApiError(400, "collection_name_required");
			}
			updates.name = data.name.trim();
		}

		if (data.bookIds !== undefined) {
			await validateBookIds(data.bookIds);
			updates.bookIds = data.bookIds.map((bookId) => new mongoose.Types.ObjectId(bookId));
		}

		if (Object.keys(updates).length === 0) {
			throw new ApiError(400, "collection_empty_update");
		}

		const collection = await CollectionModel.findByIdAndUpdate(
			{ _id: collectionId, userId },
			{ $set: { ...updates, updatedAt: new Date() } },
			{ new: true },
		);

		if (!collection) {
			throw new ApiError(404, "collection_not_found");
		}

		return toCollectionDTO(collection);
	}

	static async deleteCollection(userId: string, collectionId: string): Promise<void> {
		if (!mongoose.Types.ObjectId.isValid(collectionId)) {
			throw new ApiError(400, "collection_invalid_id");
		}

		const result = await CollectionModel.deleteOne({ _id: collectionId, userId });
		if (result.deletedCount === 0) {
			throw new ApiError(404, "collection_not_found");
		}
	}
}
