/**
 * Query-building helpers for audiobook catalog reads and admin-side metadata maintenance.
 * Filtering and pagination logic lives here so controllers/services do not
 * duplicate Mongo query construction or drift in how user-facing filters are
 * interpreted.
 */
import {
	BOOK_HEALTH_FILTERS,
	BOOK_MISSING_FIELDS,
	BOOK_SORTS,
	SERIES_SORTS,
	type BookHealthFilter,
	type BookMissingField,
	type BookSort,
	type ListBooksQueryDTO,
} from "../../dto/book.dto.js";
import { normalizeTagList } from "../../utils/normalize.js";

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toContainsRegex(value: string): RegExp {
	return new RegExp(escapeRegex(value.trim()), "i");
}

const EMPTY_TEXT = { $in: [null, ""] };

// Each missing-field filter matches books where that metadata is absent.
export const MISSING_FIELD_CONDITIONS: Record<BookMissingField, Record<string, unknown>> = {
	cover: { coverPath: EMPTY_TEXT },
	description: {
		"description.default": EMPTY_TEXT,
		"description.en": EMPTY_TEXT,
		"description.fr": EMPTY_TEXT,
	},
	series: { series: EMPTY_TEXT },
	genre: { genre: EMPTY_TEXT },
	tags: { "tags.0": { $exists: false } },
};

export const HEALTH_CONDITIONS: Record<BookHealthFilter, Record<string, unknown>> = {
	sync_error: { "fileSync.status": "error" },
	dirty: { "fileSync.status": { $in: ["dirty", "writing"] } },
	processing: { processingState: { $in: ["pending_sanitize", "sanitizing"] } },
	sanitize_failed: { processingState: "sanitize_failed" },
};

export function buildBookFilterConditions(
	filters: ListBooksQueryDTO,
): Record<string, unknown>[] {
	const conditions: Record<string, unknown>[] = [];

	if (filters.q && filters.q.trim()) {
		const matcher = toContainsRegex(filters.q);
		conditions.push({
			$or: [
				{ title: matcher },
				{ author: matcher },
				{ series: matcher },
				{ genre: matcher },
				{ tags: matcher },
			],
		});
	}

	if (filters.title && filters.title.trim()) {
		conditions.push({ title: toContainsRegex(filters.title) });
	}

	if (filters.author && filters.author.trim()) {
		conditions.push({ author: toContainsRegex(filters.author) });
	}

	if (filters.series && filters.series.trim()) {
		conditions.push({ series: toContainsRegex(filters.series) });
	}

	if (filters.tags) {
		const tags = normalizeTagList(
			Array.isArray(filters.tags)
				? filters.tags
				: String(filters.tags)
						.split(",")
						.map((value) => value.trim())
						.filter(Boolean),
		);

		if (tags.length > 0) {
			conditions.push({ normalizedTags: { $all: tags } });
		}
	}

	if (filters.genre && filters.genre.trim()) {
		conditions.push({ genre: toContainsRegex(filters.genre) });
	}

	if (filters.language && filters.language.trim()) {
		conditions.push({ language: toContainsRegex(filters.language) });
	}

	for (const field of filters.missing ?? []) {
		conditions.push(MISSING_FIELD_CONDITIONS[field]);
	}

	if (filters.health) {
		conditions.push(HEALTH_CONDITIONS[filters.health]);
	}

	if (typeof filters.minDuration === "number" && Number.isFinite(filters.minDuration)) {
		conditions.push({ duration: { $gte: filters.minDuration } });
	}

	if (typeof filters.maxDuration === "number" && Number.isFinite(filters.maxDuration)) {
		conditions.push({ duration: { $lte: filters.maxDuration } });
	}

	return conditions;
}

export function buildBookQuery(filters: ListBooksQueryDTO): Record<string, unknown> {
	const conditions = buildBookFilterConditions(filters);

	if (conditions.length === 0) {
		return {};
	}

	if (conditions.length === 1) {
		return conditions[0];
	}

	return { $and: conditions };
}

// _id is the final tiebreaker so pagination stays stable between pages.
export function buildBookSort(sort: BookSort): Record<string, 1 | -1> {
	switch (sort) {
		case "oldest":
			return { createdAt: 1, _id: 1 };
		case "title":
			return { title: 1, _id: 1 };
		case "author":
			return { author: 1, series: 1, seriesIndex: 1, title: 1, _id: 1 };
		case "series":
			return { series: 1, seriesIndex: 1, title: 1, _id: 1 };
		case "duration":
			return { duration: 1, _id: 1 };
		case "duration_desc":
			return { duration: -1, _id: 1 };
		case "updated":
			return { updatedAt: -1, _id: -1 };
		case "recent":
		default:
			return { createdAt: -1, _id: -1 };
	}
}

function firstString(value: unknown): string | undefined {
	if (Array.isArray(value)) {
		return firstString(value[0]);
	}
	return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
	const raw = firstString(value);
	if (raw === undefined || raw.trim() === "") {
		return undefined;
	}
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
	const raw = firstString(value);
	return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

// Shared by the book and series controllers so both read query strings the same way.
export function parseListBooksQuery(query: Record<string, unknown>): ListBooksQueryDTO {
	const tagsRaw = firstString(query.tags);
	const missingRaw = firstString(query.missing);

	return {
		q: firstString(query.q),
		title: firstString(query.title),
		author: firstString(query.author),
		series: firstString(query.series),
		tags: tagsRaw
			? tagsRaw
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean)
			: undefined,
		genre: firstString(query.genre),
		language: firstString(query.language),
		sort: oneOf(BOOK_SORTS, query.sort) ?? oneOf(SERIES_SORTS, query.sort),
		missing: missingRaw
			? missingRaw
					.split(",")
					.map((value) => oneOf(BOOK_MISSING_FIELDS, value.trim()))
					.filter((value): value is BookMissingField => Boolean(value))
			: undefined,
		health: oneOf(BOOK_HEALTH_FILTERS, query.health),
		minDuration: optionalNumber(query.minDuration),
		maxDuration: optionalNumber(query.maxDuration),
		limit: optionalNumber(query.limit),
		offset: optionalNumber(query.offset),
	};
}
