/**
 * Metadata cleanup report: export every book with metadata problems as a JSON
 * document an assistant (human or AI) can fill in, then import the filled
 * document back as a reviewed batch of metadata edits.
 *
 * Applying goes through BookService.updateMetadata, so overrides are recorded
 * and the worker receives the usual WRITE_METADATA jobs to update the files.
 */
import path from "node:path";

import { ApiError } from "../../utils/api-error.js";
import { normalizeTagToken } from "../../utils/normalize.js";
import { BookModel } from "./book.model.js";
import { PLACEHOLDER_GENRE } from "./book.query.js";
import { BookService } from "./book.service.js";
import type { UpdateBookMetadataDTO } from "../../dto/book.dto.js";

export const REPORT_FORMAT = "audiobook-metadata-report/v1";
const MAX_REPORT_CHANGES = 2000;

const EDITABLE_FIELDS = [
	"title",
	"author",
	"series",
	"seriesIndex",
	"genre",
	"language",
	"tags",
	"description",
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

export interface ReportBookCurrent {
	title: string;
	author: string;
	series: string | null;
	seriesIndex: number | null;
	genre: string | null;
	language: string | null;
	tags: string[];
	description: string | null;
}

export interface ReportBookEntry {
	id: string;
	file: string;
	durationHours: number;
	current: ReportBookCurrent;
	issues: string[];
	changes: Partial<Record<EditableField, unknown>>;
}

export interface VariantGroup {
	variants: Array<{ name: string; count: number }>;
}

export interface MetadataReport {
	format: typeof REPORT_FORMAT;
	generatedAt: string;
	instructions: string[];
	summary: {
		totalBooks: number;
		booksInReport: number;
		issueCounts: Record<string, number>;
	};
	seriesVariants: VariantGroup[];
	genreVariants: VariantGroup[];
	seriesRenames: Record<string, string>;
	genreRenames: Record<string, string>;
	books: ReportBookEntry[];
}

export interface ReportChangePreview {
	bookId: string;
	title: string;
	changes: Array<{ field: EditableField; from: unknown; to: unknown }>;
	error?: string;
}

export interface ReportImportResult {
	dryRun: boolean;
	items: ReportChangePreview[];
	applied: number;
	unchanged: number;
	errors: number;
	jobsQueued: boolean;
}

const INSTRUCTIONS = [
	"This file lists audiobooks whose metadata looks incomplete or inconsistent. Each book has its current metadata, the detected issues, and an empty \"changes\" object.",
	"For each book, research the real book (publisher, Audible, Goodreads, Open Library...) and put ONLY the fields that should change into \"changes\". Leave \"changes\" as {} when nothing should change. Never edit \"id\" or \"current\".",
	"Allowed fields in changes: title, author, series, seriesIndex, genre, language, tags, description.",
	"title: the clean book title, without '(Unabridged)', narrator names, track numbers, file extensions or the series number.",
	"author: the author only (never the narrator). Several authors are separated by ', '.",
	"series: canonical series name without the number. Use null for a standalone book. seriesIndex: the number in the series (number, decimals allowed, e.g. 2.5).",
	"genre: one specific genre in English title case that helps browsing (e.g. LitRPG, Progression Fantasy, Cultivation, Epic Fantasy, Science Fiction, Thriller, Mystery). Never 'Audiobook'. Keep the set of genres small and consistent across the file.",
	"language: \"en\" or \"fr\" (the language of the audio).",
	"tags: the complete new list of 3 to 8 short lowercase descriptors (it replaces the existing tags).",
	"description: a 2 to 4 sentence spoiler-free synopsis in the book's language, in your own words.",
	"seriesVariants / genreVariants list names that look like spellings of the same thing. To merge them for every book at once, fill the top-level \"seriesRenames\" / \"genreRenames\" maps as {\"old name\": \"canonical name\"}.",
	"Use null in changes to clear a field. If you are unsure about a book, leave its changes empty rather than guessing.",
	"Return the whole file as valid JSON, keeping \"format\" unchanged.",
];

// Patterns that usually mean a title still carries file-name or edition noise.
const TITLE_NOISE: Array<[RegExp, string]> = [
	[/\b(un)?abridged\b/i, "title contains '(Un)abridged'"],
	[/\.(m4b|m4a|mp3|aac|ogg|wav)$/i, "title contains a file extension"],
	[/_/, "title contains underscores"],
	[/^\s*(\d{1,3}|cd\s*\d+|disc\s*\d+)\s*[-_.)]\s*/i, "title starts with a track/disc number"],
	[/\b(book|tome|vol(ume)?|part|livre)\s*\.?\s*\d+\b/i, "title contains a series/volume number"],
	[/\[[^\]]*\]|\{[^}]*\}/, "title contains bracketed tags"],
	[/\b(narrated|read|lu)\s+(by|par)\b/i, "title mentions the narrator"],
];

const AUTHOR_NOISE: Array<[RegExp, string]> = [
	[/\b(narrated|read|lu)\s+(by|par)\b|\bnarrator\b/i, "author mentions the narrator"],
	[/^\s*(unknown|various|n\/a|author)\s*$/i, "author is a placeholder"],
	[/\s(&|and|et|;|\/)\s|;/i, "author list uses a non-standard separator"],
];

function variantKey(value: string): string {
	return normalizeTagToken(
		value
			.replace(/^\s*(the|la|le|les|l')\s+/i, "")
			.replace(/\s+(series|saga|trilogy|cycle|chronicles|série|saga)\s*$/i, ""),
	);
}

function isAllSameCase(value: string): boolean {
	const letters = value.replace(/[^\p{L}]/gu, "");
	return letters.length > 3 && (letters === letters.toUpperCase() || letters === letters.toLowerCase());
}

function hasText(value: unknown): boolean {
	return typeof value === "string" && value.trim().length > 0;
}

function sameValue(left: unknown, right: unknown): boolean {
	if (Array.isArray(left) || Array.isArray(right)) {
		const a = Array.isArray(left) ? left : [];
		const b = Array.isArray(right) ? right : [];
		return a.length === b.length && a.every((value, index) => value === b[index]);
	}
	return (left ?? null) === (right ?? null);
}

function groupVariants(names: Map<string, number>): VariantGroup[] {
	const byKey = new Map<string, Array<{ name: string; count: number }>>();
	for (const [name, count] of names) {
		const key = variantKey(name);
		if (!key) continue;
		byKey.set(key, [...(byKey.get(key) ?? []), { name, count }]);
	}
	return Array.from(byKey.values())
		.filter((variants) => variants.length > 1)
		.map((variants) => ({ variants: variants.sort((a, b) => b.count - a.count) }));
}

type LeanBook = {
	_id: unknown;
	filePath: string;
	title: string;
	author: string;
	series?: string | null;
	seriesIndex?: number | null;
	genre?: string | null;
	language?: string | null;
	tags?: string[];
	coverPath?: string | null;
	duration: number;
	description?: { default?: string | null; en?: string | null; fr?: string | null } | null;
};

function currentOf(book: LeanBook): ReportBookCurrent {
	return {
		title: book.title,
		author: book.author,
		series: book.series ?? null,
		seriesIndex: book.seriesIndex ?? null,
		genre: book.genre ?? null,
		language: book.language ?? null,
		tags: book.tags ?? [],
		description: book.description?.default ?? book.description?.en ?? book.description?.fr ?? null,
	};
}

export class BookReportService {
	static async buildReport(options: { includeAll?: boolean; language?: string }): Promise<MetadataReport> {
		const filter = options.language ? { language: options.language } : {};
		const books = (await BookModel.find(filter)
			.select("filePath title author series seriesIndex genre language tags coverPath duration description")
			.sort({ series: 1, seriesIndex: 1, title: 1 })
			.lean()) as unknown as LeanBook[];

		const seriesNames = new Map<string, number>();
		const genreNames = new Map<string, number>();
		const seriesIndexUse = new Map<string, number>();
		for (const book of books) {
			if (hasText(book.series)) {
				seriesNames.set(book.series!, (seriesNames.get(book.series!) ?? 0) + 1);
				if (book.seriesIndex !== null && book.seriesIndex !== undefined) {
					const key = `${variantKey(book.series!)}#${book.seriesIndex}`;
					seriesIndexUse.set(key, (seriesIndexUse.get(key) ?? 0) + 1);
				}
			}
			if (hasText(book.genre)) {
				genreNames.set(book.genre!, (genreNames.get(book.genre!) ?? 0) + 1);
			}
		}

		const seriesVariants = groupVariants(seriesNames);
		const genreVariants = groupVariants(genreNames);
		const variantSeries = new Set(seriesVariants.flatMap((group) => group.variants.slice(1).map((v) => v.name)));
		const variantGenres = new Set(genreVariants.flatMap((group) => group.variants.slice(1).map((v) => v.name)));

		const issueCounts: Record<string, number> = {};
		const entries: ReportBookEntry[] = [];

		for (const book of books) {
			const issues: string[] = [];
			const current = currentOf(book);

			if (!hasText(book.coverPath)) issues.push("missing cover (fix by hand in the editor)");
			if (!hasText(current.description)) issues.push("missing description");
			if (!hasText(book.genre)) issues.push("missing genre");
			else if (PLACEHOLDER_GENRE.test(book.genre!)) issues.push(`genre '${book.genre}' is a placeholder, not a real genre`);
			if ((book.tags ?? []).length === 0) issues.push("missing tags");
			if (hasText(book.series) && (book.seriesIndex === null || book.seriesIndex === undefined)) {
				issues.push("in a series but missing series number");
			}
			if (!hasText(book.series) && /\b(book|tome|vol(ume)?|livre)\s*\.?\s*\d+\b|#\s*\d+/i.test(book.title)) {
				issues.push("title suggests a series but no series is set");
			}
			const titleNumber = /\b(?:book|tome|vol(?:ume)?|livre)\s*\.?\s*0*(\d+(?:\.\d+)?)\b/i.exec(book.title);
			if (titleNumber && book.seriesIndex !== null && book.seriesIndex !== undefined
				&& Number(titleNumber[1]) !== book.seriesIndex) {
				issues.push(`title says book ${Number(titleNumber[1])} but series number is ${book.seriesIndex}`);
			}
			if (hasText(book.series) && /:\s|\s[-–]\s/.test(book.series!)) {
				issues.push("series name includes a subtitle (e.g. ': A LitRPG Adventure')");
			}
			if (hasText(book.series) && /\d+\s*$|#\s*\d+/.test(book.series!)) {
				issues.push("series name contains a number");
			}
			if (hasText(book.series) && book.seriesIndex !== null && book.seriesIndex !== undefined
				&& (seriesIndexUse.get(`${variantKey(book.series!)}#${book.seriesIndex}`) ?? 0) > 1) {
				issues.push("series number used by another book in the same series");
			}
			if (hasText(book.series) && variantSeries.has(book.series!)) {
				issues.push("series name is a variant spelling of another series (see seriesVariants)");
			}
			if (hasText(book.genre) && variantGenres.has(book.genre!)) {
				issues.push("genre is a variant spelling of another genre (see genreVariants)");
			}
			for (const [pattern, label] of TITLE_NOISE) {
				if (pattern.test(book.title)) issues.push(label);
			}
			if (isAllSameCase(book.title)) issues.push("title is all upper or lower case");
			const fileStem = path.parse(book.filePath).name;
			if (book.title.trim().toLowerCase() === fileStem.trim().toLowerCase() && /[_.-]/.test(fileStem)) {
				issues.push("title looks like the file name");
			}
			for (const [pattern, label] of AUTHOR_NOISE) {
				if (pattern.test(book.author)) issues.push(label);
			}
			if (hasText(book.series) && book.title.trim().toLowerCase() === book.series!.trim().toLowerCase()) {
				issues.push("title is identical to the series name");
			}

			// Group issues that embed a value (genre name, numbers) under one summary key.
			for (const issue of issues) {
				const key = issue.replace(/'[^']*'|\d+(\.\d+)?/g, "…");
				issueCounts[key] = (issueCounts[key] ?? 0) + 1;
			}

			if (issues.length > 0 || options.includeAll) {
				entries.push({
					id: String(book._id),
					file: path.basename(book.filePath),
					durationHours: Math.round((book.duration / 3600) * 10) / 10,
					current,
					issues,
					changes: {},
				});
			}
		}

		return {
			format: REPORT_FORMAT,
			generatedAt: new Date().toISOString(),
			instructions: INSTRUCTIONS,
			summary: {
				totalBooks: books.length,
				booksInReport: entries.length,
				issueCounts: Object.fromEntries(Object.entries(issueCounts).sort((a, b) => b[1] - a[1])),
			},
			seriesVariants,
			genreVariants,
			seriesRenames: {},
			genreRenames: {},
			books: entries,
		};
	}

	static async importReport(raw: unknown, options: { dryRun: boolean }): Promise<ReportImportResult> {
		const doc = (raw ?? {}) as Partial<MetadataReport>;
		if (doc.format !== REPORT_FORMAT) {
			throw new ApiError(400, "report_format_invalid");
		}

		const seriesRenames = BookReportService.readRenameMap(doc.seriesRenames);
		const genreRenames = BookReportService.readRenameMap(doc.genreRenames);
		const perBook = new Map<string, Partial<Record<EditableField, unknown>>>();

		for (const entry of Array.isArray(doc.books) ? doc.books : []) {
			if (!entry || typeof entry.id !== "string" || !entry.changes || typeof entry.changes !== "object") {
				continue;
			}
			const changes = Object.fromEntries(
				Object.entries(entry.changes).filter(([key]) => (EDITABLE_FIELDS as readonly string[]).includes(key)),
			);
			if (Object.keys(changes).length > 0) {
				perBook.set(entry.id, changes);
			}
		}

		// Renames expand into per-book changes; an explicit per-book value wins.
		if (seriesRenames.size > 0 || genreRenames.size > 0) {
			const affected = await BookModel.find({
				$or: [
					{ series: { $in: Array.from(seriesRenames.keys()) } },
					{ genre: { $in: Array.from(genreRenames.keys()) } },
				],
			}).select("series genre").lean();
			for (const book of affected as unknown as Array<{ _id: unknown; series?: string | null; genre?: string | null }>) {
				const id = String(book._id);
				const changes = perBook.get(id) ?? {};
				if (book.series && seriesRenames.has(book.series) && !("series" in changes)) {
					changes.series = seriesRenames.get(book.series);
				}
				if (book.genre && genreRenames.has(book.genre) && !("genre" in changes)) {
					changes.genre = genreRenames.get(book.genre);
				}
				perBook.set(id, changes);
			}
		}

		if (perBook.size > MAX_REPORT_CHANGES) {
			throw new ApiError(400, "report_too_many_changes");
		}

		const result: ReportImportResult = {
			dryRun: options.dryRun,
			items: [],
			applied: 0,
			unchanged: 0,
			errors: 0,
			jobsQueued: false,
		};

		const ids = Array.from(perBook.keys()).filter((id) => /^[a-f0-9]{24}$/i.test(id));
		const books = (await BookModel.find({ _id: { $in: ids } })
			.select("filePath title author series seriesIndex genre language tags coverPath duration description")
			.lean()) as unknown as LeanBook[];
		const byId = new Map(books.map((book) => [String(book._id), book]));

		for (const [bookId, changes] of perBook) {
			const book = byId.get(bookId);
			if (!book) {
				result.errors += 1;
				result.items.push({ bookId, title: "(unknown book)", changes: [], error: "book_not_found" });
				continue;
			}

			const { payload, diff, error } = BookReportService.toPayload(currentOf(book), changes);
			if (error) {
				result.errors += 1;
				result.items.push({ bookId, title: book.title, changes: diff, error });
				continue;
			}
			if (diff.length === 0) {
				result.unchanged += 1;
				continue;
			}

			// The editor's description is the default text; keep any per-locale texts.
			if (payload.description) {
				payload.description = {
					...payload.description,
					en: book.description?.en ?? null,
					fr: book.description?.fr ?? null,
				};
			}

			const item: ReportChangePreview = { bookId, title: book.title, changes: diff };
			if (!options.dryRun) {
				try {
					await BookService.updateMetadata(bookId, payload);
					result.applied += 1;
					result.jobsQueued ||= diff.some((change) => ["title", "author", "series", "genre"].includes(change.field));
				} catch (caught) {
					result.errors += 1;
					item.error = caught instanceof Error ? caught.message : "update_failed";
				}
			}
			result.items.push(item);
		}

		return result;
	}

	private static readRenameMap(value: unknown): Map<string, string | null> {
		const map = new Map<string, string | null>();
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			return map;
		}
		for (const [from, to] of Object.entries(value as Record<string, unknown>)) {
			if (from.trim() && (to === null || typeof to === "string") && from !== to) {
				map.set(from, typeof to === "string" && to.trim() ? to.trim() : null);
			}
		}
		return map;
	}

	// Validates one book's requested changes and keeps only real differences.
	private static toPayload(
		current: ReportBookCurrent,
		changes: Partial<Record<EditableField, unknown>>,
	): { payload: UpdateBookMetadataDTO; diff: ReportChangePreview["changes"]; error?: string } {
		const payload: UpdateBookMetadataDTO = {};
		const diff: ReportChangePreview["changes"] = [];
		const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

		for (const field of EDITABLE_FIELDS) {
			if (!(field in changes)) continue;
			const value = changes[field];

			switch (field) {
				case "title":
				case "author": {
					const next = text(value);
					if (!next) return { payload, diff, error: `${field}_cannot_be_empty` };
					if (next !== current[field]) {
						payload[field] = next;
						diff.push({ field, from: current[field], to: next });
					}
					break;
				}
				case "series":
				case "genre": {
					if (value !== null && typeof value !== "string") return { payload, diff, error: `${field}_invalid` };
					const next = text(value);
					if (next !== current[field]) {
						payload[field] = next;
						diff.push({ field, from: current[field], to: next });
					}
					break;
				}
				case "seriesIndex": {
					const next = value === null || value === "" ? null : Number(value);
					if (next !== null && (!Number.isFinite(next) || next < 0)) return { payload, diff, error: "seriesIndex_invalid" };
					if (next !== current.seriesIndex) {
						payload.seriesIndex = next;
						diff.push({ field, from: current.seriesIndex, to: next });
					}
					break;
				}
				case "language": {
					if (value !== "en" && value !== "fr") return { payload, diff, error: "language_invalid" };
					if (value !== current.language) {
						payload.language = value;
						diff.push({ field, from: current.language, to: value });
					}
					break;
				}
				case "tags": {
					const list = Array.isArray(value)
						? value
						: typeof value === "string"
							? value.split(",")
							: null;
					if (!list) return { payload, diff, error: "tags_invalid" };
					const next = Array.from(new Set(list.map((tag) => String(tag).trim()).filter(Boolean)));
					if (!sameValue(next, current.tags)) {
						payload.tags = next;
						diff.push({ field, from: current.tags, to: next });
					}
					break;
				}
				case "description": {
					if (value !== null && typeof value !== "string") return { payload, diff, error: "description_invalid" };
					const next = text(value);
					if (next !== current.description) {
						payload.description = { default: next };
						diff.push({ field, from: current.description, to: next });
					}
					break;
				}
			}
		}

		return { payload, diff };
	}
}
