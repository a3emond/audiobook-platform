import mongoose from "mongoose";

import type {
	BookDTO,
	ChapterDTO,
	ListBooksQueryDTO,
	UpdateBookMetadataDTO,
	UpdateChaptersDTO,
} from "../../dto/book.dto.js";
import { ApiError } from "../../utils/api-error.js";
import { BookModel, type BookDocument } from "./book.model.js";
import { JobModel } from "../jobs/job.model.js";
import { buildBookQuery } from "./book.query.js";

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
		const limit = filters.limit ?? 20;
		const offset = filters.offset ?? 0;
		const query = buildBookQuery(filters);

		const [books, total] = await Promise.all([
			BookModel.find(query)
				.sort({ updatedAt: -1 })
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
			updates.series = data.series;
			updates["overrides.series"] = true;
		}

		if (data.seriesIndex !== undefined) {
			updates.seriesIndex = data.seriesIndex;
			updates["overrides.seriesIndex"] = true;
		}

		if (data.genre !== undefined) {
			updates.genre = data.genre;
		}

		if (data.tags !== undefined) {
			updates.tags = data.tags;
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
			{ new: true },
		);

		if (!book) {
			throw new ApiError(404, "book_not_found");
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
			{ new: true },
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
}
