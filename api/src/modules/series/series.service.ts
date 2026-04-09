import type { ListBooksQueryDTO } from "../../dto/book.dto.js";
import type {
	SeriesDetailDTO,
	SeriesListItemDTO,
	SeriesListResponseDTO,
} from "../../dto/series.dto.js";
import { ApiError } from "../../utils/api-error.js";
import { BookModel, type BookDocument } from "../books/book.model.js";
import { buildBookFilterConditions } from "../books/book.query.js";

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toBookDTO(book: BookDocument) {
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

function buildSeriesId(seriesName: string): string {
	return seriesName
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function normalizeSeriesName(seriesName: string): string {
	return seriesName.trim().replace(/\s+/g, " ");
}

function normalizeSeriesKey(seriesName: string): string {
	return normalizeSeriesName(seriesName).toLocaleLowerCase();
}

function sortSeriesBooks(books: BookDocument[]): BookDocument[] {
	return [...books].sort((left, right) => {
		const leftIndex = left.seriesIndex ?? Number.MAX_SAFE_INTEGER;
		const rightIndex = right.seriesIndex ?? Number.MAX_SAFE_INTEGER;

		if (leftIndex !== rightIndex) {
			return leftIndex - rightIndex;
		}

		return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
	});
}

function summarizeSeries(seriesName: string, books: BookDocument[]): SeriesListItemDTO {
	const authors = Array.from(
		new Set(
			books
				.map((book) => book.author)
				.filter((value): value is string => Boolean(value)),
		),
	).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
	const genres = Array.from(
		new Set(
			books
				.map((book) => book.genre)
				.filter((value): value is string => Boolean(value)),
		),
	).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));

	return {
		id: buildSeriesId(seriesName),
		name: seriesName,
		bookCount: books.length,
		totalDuration: books.reduce((sum, book) => sum + (book.duration ?? 0), 0),
		authors,
		genres,
		coverPath: books.find((book) => book.coverPath)?.coverPath ?? null,
	};
}

export class SeriesService {
	static async listSeries(filters: ListBooksQueryDTO): Promise<SeriesListResponseDTO> {
		const limit = filters.limit ?? 20;
		const offset = filters.offset ?? 0;
		const conditions = buildBookFilterConditions(filters);
		const query =
			conditions.length > 0
				? { $and: [{ series: { $exists: true, $nin: [null, ""] } }, ...conditions] }
				: { series: { $exists: true, $nin: [null, ""] } };

		const books = await BookModel.find(query).sort({ series: 1, seriesIndex: 1, title: 1 });
		const groups = new Map<string, { name: string; books: BookDocument[] }>();

		for (const book of books) {
			if (!book.series) {
				continue;
			}

			const normalizedName = normalizeSeriesName(book.series);
			if (!normalizedName) {
				continue;
			}

			const key = normalizeSeriesKey(normalizedName);
			const current = groups.get(key) ?? { name: normalizedName, books: [] };
			current.books.push(book);
			groups.set(key, current);
		}

		const allSeries = Array.from(groups.entries())
			.map(([, group]) => summarizeSeries(group.name, sortSeriesBooks(group.books)))
			.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
		const series = allSeries.slice(offset, offset + limit);

		return {
			series,
			total: allSeries.length,
			limit,
			offset,
			hasMore: offset + series.length < allSeries.length,
		};
	}

	static async getSeriesByName(
		seriesName: string,
		filters: Omit<ListBooksQueryDTO, "series" | "limit" | "offset">,
	): Promise<SeriesDetailDTO> {
		if (!seriesName.trim()) {
			throw new ApiError(400, "series_name_required");
		}

		const conditions = buildBookFilterConditions(filters);
		const query = {
			$and: [
				{ series: new RegExp(`^\\s*${escapeRegex(normalizeSeriesName(seriesName))}\\s*$`, "i") },
				...conditions,
			],
		};

		const books = await BookModel.find(query).sort({ seriesIndex: 1, title: 1 });
		if (books.length === 0) {
			throw new ApiError(404, "series_not_found");
		}

		const orderedBooks = sortSeriesBooks(books);
		const summary = summarizeSeries(orderedBooks[0].series ?? seriesName.trim(), orderedBooks);

		return {
			id: summary.id,
			name: summary.name,
			bookCount: summary.bookCount,
			totalDuration: summary.totalDuration,
			authors: summary.authors,
			genres: summary.genres,
			books: orderedBooks.map(toBookDTO),
		};
	}
}