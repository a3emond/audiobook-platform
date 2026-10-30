/**
 * Core business logic for audiobook catalog reads and admin-side metadata maintenance.
 * In this codebase, services are the place where models, validation results,
 * worker/job coordination, and cross-feature rules come together so controllers
 * remain small and the domain behavior stays testable and reusable.
 */
import mongoose from "mongoose";

import {
	BOOK_HEALTH_FILTERS,
	BOOK_MISSING_FIELDS,
	BOOK_SORTS,
	type BookDTO,
	type BookFacetsDTO,
	type BookSort,
	type BulkBookResultDTO,
	type BulkBookUpdateDTO,
	type ChapterDTO,
	type FacetCountDTO,
	type ListBooksQueryDTO,
	type UpdateBookMetadataDTO,
	type UpdateChaptersDTO,
} from "../../dto/book.dto.js";
import { ApiError } from "../../utils/api-error.js";
import { normalizeOptionalText, normalizeTagList } from "../../utils/normalize.js";
import { BookModel, type BookDocument } from "./book.model.js";
import { JobModel } from "../jobs/job.model.js";
import {
	buildBookQuery,
	buildBookSort,
	HEALTH_CONDITIONS,
	MISSING_FIELD_CONDITIONS,
	PLACEHOLDER_GENRE,
} from "./book.query.js";

const MAX_LIST_LIMIT = 200;
const MAX_BULK_BOOKS = 500;

function toFacetCounts(rows: Array<{ _id: unknown; count: number }>): FacetCountDTO[] {
	return rows
		.filter((row) => typeof row._id === "string" && row._id.trim().length > 0)
		.map((row) => ({ value: String(row._id), count: row.count }));
}

function toBookDTO(book: BookDocument): BookDTO {
	return {
		id: String(book._id),
		filePath: book.filePath,
		checksum: book.checksum,
		title: book.title,
		author: book.author,
		series: book.series,
		seriesIndex: book.seriesIndex,
		duration: book.duration,
		language: book.language,
		chapters: (book.chapters ?? []).map((chapter) => ({
			index: chapter.index,
			title: chapter.title,
			start: chapter.start,
			end: chapter.end,
		})),
		coverPath: book.coverPath,
		tags: book.tags ?? [],
		genre: book.genre,
		description: {
			default: book.description?.default ?? null,
			fr: book.description?.fr ?? null,
			en: book.description?.en ?? null,
		},
		overrides: {
			title: book.overrides?.title ?? false,
			author: book.overrides?.author ?? false,
			series: book.overrides?.series ?? false,
			seriesIndex: book.overrides?.seriesIndex ?? false,
			chapters: book.overrides?.chapters ?? false,
			cover: book.overrides?.cover ?? false,
			description: book.overrides?.description ?? false,
		},
		fileSync: {
			status: book.fileSync?.status ?? "in_sync",
			lastReadAt: book.fileSync?.lastReadAt
				? new Date(book.fileSync.lastReadAt).toISOString()
				: null,
			lastWriteAt: book.fileSync?.lastWriteAt
				? new Date(book.fileSync.lastWriteAt).toISOString()
				: null,
		},
		version: book.version,
		lastScannedAt: new Date(book.lastScannedAt).toISOString(),
		processingState: (book.processingState as BookDTO["processingState"]) ?? "ready",
		createdAt: book.createdAt ? new Date(book.createdAt).toISOString() : undefined,
		updatedAt: book.updatedAt ? new Date(book.updatedAt).toISOString() : undefined,
	};
}

export class BookService {
	static async listBooks(filters: ListBooksQueryDTO): Promise<{
		books: BookDTO[];
		total: number;
		limit: number;
		offset: number;
		hasMore: boolean;
	}> {
		const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, filters.limit ?? 20));
		const offset = Math.max(0, filters.offset ?? 0);
		const query = buildBookQuery(filters);
		const sort: BookSort = (BOOK_SORTS as readonly string[]).includes(filters.sort ?? "")
			? (filters.sort as BookSort)
			: "recent";

		const [books, total] = await Promise.all([
			BookModel.find(query)
				.collation({ locale: "en", strength: 2 })
				.sort(buildBookSort(sort))
				.limit(limit)
				.skip(offset),
			BookModel.countDocuments(query),
		]);

		return {
			books: books.map(toBookDTO),
			total,
			limit,
			offset,
			hasMore: offset + books.length < total,
		};
	}

	// Facets describe the catalog matching the base filters (language, search),
	// so the filter UI can offer only values that actually exist.
	static async getFacets(filters: ListBooksQueryDTO): Promise<BookFacetsDTO> {
		const match = buildBookQuery({ q: filters.q, language: filters.language });

		const countWhere = (extra: Record<string, unknown>) =>
			BookModel.countDocuments(Object.keys(match).length > 0 ? { $and: [match, extra] } : extra);

		const [facetResult] = await BookModel.aggregate<{
			total: Array<{ count: number }>;
			genres: Array<{ _id: unknown; count: number }>;
			tags: Array<{ _id: unknown; count: number }>;
			authors: Array<{ _id: unknown; count: number }>;
			series: Array<{ _id: unknown; count: number }>;
			languages: Array<{ _id: unknown; count: number }>;
		}>([
			{ $match: match },
			{
				$facet: {
					total: [{ $count: "count" }],
					genres: [
						{ $group: { _id: "$genre", count: { $sum: 1 } } },
						{ $sort: { count: -1, _id: 1 } },
						{ $limit: 60 },
					],
					tags: [
						{ $unwind: "$normalizedTags" },
						{ $group: { _id: "$normalizedTags", count: { $sum: 1 } } },
						{ $sort: { count: -1, _id: 1 } },
						{ $limit: 60 },
					],
					authors: [
						{ $group: { _id: "$author", count: { $sum: 1 } } },
						{ $sort: { count: -1, _id: 1 } },
						{ $limit: 200 },
					],
					series: [
						{ $group: { _id: "$series", count: { $sum: 1 } } },
						{ $sort: { _id: 1 } },
						{ $limit: 500 },
					],
					languages: [{ $group: { _id: "$language", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
				},
			},
		]);

		const missingCounts = await Promise.all(
			BOOK_MISSING_FIELDS.map((field) => countWhere(MISSING_FIELD_CONDITIONS[field])),
		);
		const healthCounts = await Promise.all(
			BOOK_HEALTH_FILTERS.map((filter) => countWhere(HEALTH_CONDITIONS[filter])),
		);

		return {
			total: facetResult?.total[0]?.count ?? 0,
			genres: toFacetCounts(facetResult?.genres ?? []).filter((genre) => !PLACEHOLDER_GENRE.test(genre.value)),
			tags: toFacetCounts(facetResult?.tags ?? []),
			authors: toFacetCounts(facetResult?.authors ?? []),
			series: toFacetCounts(facetResult?.series ?? []),
			languages: toFacetCounts(facetResult?.languages ?? []),
			missing: Object.fromEntries(
				BOOK_MISSING_FIELDS.map((field, index) => [field, missingCounts[index]]),
			) as BookFacetsDTO["missing"],
			health: Object.fromEntries(
				BOOK_HEALTH_FILTERS.map((filter, index) => [filter, healthCounts[index]]),
			) as BookFacetsDTO["health"],
		};
	}

	// Bulk operations reuse the single-book paths so overrides and WRITE_METADATA
	// jobs behave exactly as if each book had been edited by hand.
	static async bulkUpdate(data: BulkBookUpdateDTO): Promise<BulkBookResultDTO> {
		const bookIds = Array.from(new Set(Array.isArray(data.bookIds) ? data.bookIds.map(String) : []));
		if (bookIds.length === 0) {
			throw new ApiError(400, "bulk_book_ids_required");
		}
		if (bookIds.length > MAX_BULK_BOOKS) {
			throw new ApiError(400, "bulk_too_many_books");
		}
		if (data.action !== "update" && data.action !== "delete") {
			throw new ApiError(400, "bulk_action_invalid");
		}

		const result: BulkBookResultDTO = { succeeded: [], failed: [], jobIds: [] };
		const record = (bookId: string, error: unknown) => {
			result.failed.push({ bookId, error: error instanceof Error ? error.message : "unknown_error" });
		};

		if (data.action === "delete") {
			for (const bookId of bookIds) {
				try {
					result.jobIds.push(await BookService.enqueueDeleteBook(bookId));
					result.succeeded.push(bookId);
				} catch (error) {
					record(bookId, error);
				}
			}
			return result;
		}

		const changes = data.changes ?? {};
		const addTags = (changes.addTags ?? []).map((tag) => String(tag).trim()).filter(Boolean);
		const removeTags = new Set(normalizeTagList(changes.removeTags ?? []));
		const hasTagChange = addTags.length > 0 || removeTags.size > 0;
		const base: UpdateBookMetadataDTO = {};
		if (changes.series !== undefined) base.series = changes.series;
		if (changes.genre !== undefined) base.genre = normalizeOptionalText(changes.genre);
		if (changes.language !== undefined) base.language = changes.language;
		if (changes.author !== undefined && String(changes.author).trim()) base.author = String(changes.author).trim();

		if (Object.keys(base).length === 0 && !hasTagChange) {
			throw new ApiError(400, "bulk_changes_empty");
		}

		for (const bookId of bookIds) {
			try {
				const payload: UpdateBookMetadataDTO = { ...base };
				if (hasTagChange) {
					const book = await BookModel.findById(bookId, { tags: 1 });
					if (!book) {
						throw new ApiError(404, "book_not_found");
					}
					const kept = (book.tags ?? []).filter((tag) => !removeTags.has(normalizeTagList([tag])[0] ?? ""));
					payload.tags = Array.from(new Set([...kept, ...addTags]));
				}
				await BookService.updateMetadata(bookId, payload);
				result.succeeded.push(bookId);
			} catch (error) {
				record(bookId, error);
			}
		}

		return result;
	}

	static async getBookById(bookId: string): Promise<BookDTO> {
		if (!mongoose.Types.ObjectId.isValid(bookId)) {
			throw new ApiError(400, "book_invalid_id");
		}

		const book = await BookModel.findById(bookId);
		if (!book) {
			throw new ApiError(404, "book_not_found");
		}

		return toBookDTO(book);
	}

	static async updateMetadata(
		bookId: string,
		data: UpdateBookMetadataDTO,
	): Promise<BookDTO> {
		if (!mongoose.Types.ObjectId.isValid(bookId)) {
			throw new ApiError(400, "book_invalid_id");
		}

		const updates: Record<string, unknown> = {};

		if (data.title !== undefined) {
			updates.title = data.title;
			updates["overrides.title"] = true;
		}

		if (data.author !== undefined) {
			updates.author = data.author;
			updates["overrides.author"] = true;
		}

		if (data.series !== undefined) {
			updates.series = normalizeOptionalText(data.series);
			updates["overrides.series"] = true;
		}

		if (data.seriesIndex !== undefined) {
			updates.seriesIndex = data.seriesIndex;
			updates["overrides.seriesIndex"] = true;
		}

		if (data.genre !== undefined) {
			updates.genre = data.genre;
		}

		if (data.language !== undefined) {
			if (data.language !== "en" && data.language !== "fr") {
				throw new ApiError(400, "book_language_invalid");
			}
			updates.language = data.language;
		}

		if (data.tags !== undefined) {
			updates.tags = data.tags;
			updates.normalizedTags = normalizeTagList(data.tags);
		}

		if (data.description !== undefined) {
			updates.description = {
				default: data.description.default ?? null,
				fr: data.description.fr ?? null,
				en: data.description.en ?? null,
			};
			updates["overrides.description"] = true;
		}

		if (Object.keys(updates).length === 0) {
			throw new ApiError(400, "book_metadata_empty_update");
		}

		updates.updatedAt = new Date();

		const book = await BookModel.findByIdAndUpdate(
			bookId,
			{ $set: updates },
			{ returnDocument: "after" },
		);

		if (!book) {
			throw new ApiError(404, "book_not_found");
		}

		const writeMetadataPayload: {
			bookId: string;
			title?: string;
			author?: string;
			series?: string | null;
			genre?: string | null;
		} = { bookId };

		let shouldEnqueueWriteMetadata = false;

		if (data.title !== undefined) {
			writeMetadataPayload.title = data.title;
			shouldEnqueueWriteMetadata = true;
		}

		if (data.author !== undefined) {
			writeMetadataPayload.author = data.author;
			shouldEnqueueWriteMetadata = true;
		}

		if (data.series !== undefined) {
			writeMetadataPayload.series = normalizeOptionalText(data.series);
			shouldEnqueueWriteMetadata = true;
		}

		if (data.genre !== undefined) {
			writeMetadataPayload.genre = data.genre;
			shouldEnqueueWriteMetadata = true;
		}

		if (shouldEnqueueWriteMetadata) {
			await JobModel.create({
				type: "WRITE_METADATA",
				status: "queued",
				payload: writeMetadataPayload,
				output: null,
				error: null,
				attempt: 0,
				maxAttempts: 3,
				runAfter: new Date(),
			});
		}

		return toBookDTO(book);
	}

	static async updateChapters(bookId: string, data: UpdateChaptersDTO): Promise<BookDTO> {
		if (!mongoose.Types.ObjectId.isValid(bookId)) {
			throw new ApiError(400, "book_invalid_id");
		}

		if (!Array.isArray(data.chapters) || data.chapters.length === 0) {
			throw new ApiError(400, "book_chapters_invalid");
		}

		const normalized: ChapterDTO[] = data.chapters.map((chapter, index) => {
			if (!chapter.title || chapter.start < 0 || chapter.end < chapter.start) {
				throw new ApiError(400, `book_chapter_invalid_at_${index}`);
			}

			return {
				index,
				title: chapter.title,
				start: chapter.start,
				end: chapter.end,
			};
		});

		const book = await BookModel.findByIdAndUpdate(
			bookId,
			{
				$set: {
					chapters: normalized,
					"overrides.chapters": true,
					updatedAt: new Date(),
				},
			},
			{ returnDocument: "after" },
		);

		if (!book) {
			throw new ApiError(404, "book_not_found");
		}

		await JobModel.create({
			type: "WRITE_METADATA",
			status: "queued",
			payload: {
				bookId,
				chapters: normalized.map((chapter) => ({
					title: chapter.title,
					startMs: chapter.start,
					endMs: chapter.end,
				})),
			},
			output: null,
			error: null,
			attempt: 0,
			maxAttempts: 3,
			runAfter: new Date(),
		});

		return toBookDTO(book);
	}

	static async enqueueExtractCover(bookId: string): Promise<string> {
		if (!mongoose.Types.ObjectId.isValid(bookId)) {
			throw new ApiError(400, "book_invalid_id");
		}

		const exists = await BookModel.exists({ _id: bookId });
		if (!exists) {
			throw new ApiError(404, "book_not_found");
		}

		const job = await JobModel.create({
			type: "EXTRACT_COVER",
			status: "queued",
			payload: { bookId },
			output: null,
			error: null,
			attempt: 0,
			maxAttempts: 3,
			runAfter: new Date(),
		});

		return String(job._id);
	}

	static async enqueueDeleteBook(bookId: string): Promise<string> {
		if (!mongoose.Types.ObjectId.isValid(bookId)) {
			throw new ApiError(400, "book_invalid_id");
		}

		const exists = await BookModel.exists({ _id: bookId });
		if (!exists) {
			throw new ApiError(404, "book_not_found");
		}

		const job = await JobModel.create({
			type: "DELETE_BOOK",
			status: "queued",
			payload: { bookId },
			output: null,
			error: null,
			attempt: 0,
			maxAttempts: 3,
			runAfter: new Date(),
		});

		return String(job._id);
	}

	static async enqueueReplaceCover(
		bookId: string,
		sourcePath: string,
		cleanupSource = true,
	): Promise<string> {
		if (!mongoose.Types.ObjectId.isValid(bookId)) {
			throw new ApiError(400, "book_invalid_id");
		}

		if (!sourcePath || typeof sourcePath !== "string") {
			throw new ApiError(400, "cover_source_path_required");
		}

		const exists = await BookModel.exists({ _id: bookId });
		if (!exists) {
			throw new ApiError(404, "book_not_found");
		}

		const job = await JobModel.create({
			type: "REPLACE_COVER",
			status: "queued",
			payload: {
				bookId,
				sourcePath,
				cleanupSource,
			},
			output: null,
			error: null,
			attempt: 0,
			maxAttempts: 3,
			runAfter: new Date(),
		});

		return String(job._id);
	}
}
