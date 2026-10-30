/**
 * Shared safety rails for the ingest jobs:
 * - books are inserted with their final filePath already set, so concurrent
 *   ingests never collide on the unique filePath index (a missing path used to
 *   index as `null` and fail every other in-flight ingest);
 * - a failed ingest removes the book it created instead of leaving an orphan;
 * - duplicates of books already in the catalog are detected before any copy.
 */
import path from "path";
import mongoose from "mongoose";

import { FileService } from "./file.service.js";

const AUDIOBOOKS_PATH = process.env.AUDIOBOOKS_PATH || "/data/audiobooks";
const DUPLICATES_DIR = path.join(AUDIOBOOKS_PATH, "_uploads", "_duplicates");
// Orphans are books an old or crashed ingest created without a file.
const ORPHAN_MIN_AGE_MS = 15 * 60 * 1000;

const fileService = new FileService();

// Words that carry no identity when comparing titles across editions.
const STOP_WORDS = new Set([
	"a", "an", "the", "of", "and", "in", "on", "to", "book", "volume", "vol", "part",
	"unabridged", "abridged", "audiobook", "litrpg", "adventure", "series", "novel", "epic",
	"progression", "fantasy", "le", "la", "les", "de", "du", "des", "tome", "livre",
]);

export interface DuplicateMatch {
	bookId: string;
	title: string;
	reason: "checksum" | "title_duration";
}

export interface ReservedBook {
	bookId: mongoose.Types.ObjectId;
	bookDir: string;
	audioPath: string;
}

function booksCollection() {
	const db = mongoose.connection.db;
	if (!db) {
		throw new Error("db_not_connected");
	}
	return db.collection<Record<string, unknown>>("books");
}

export function identityTokens(value: string | null | undefined): Set<string> {
	return new Set(
		(value ?? "")
			.toLocaleLowerCase()
			.normalize("NFKD")
			.replace(/[̀-ͯ]/g, "")
			.split(/[^a-z0-9]+/)
			.filter((token) => token.length > 1 && !STOP_WORDS.has(token) && !/^0*\d{1,3}$/.test(token)),
	);
}

export function bookNumbers(...values: Array<string | number | null | undefined>): Set<string> {
	const numbers = new Set<string>();
	for (const value of values) {
		if (typeof value === "number" && Number.isFinite(value)) {
			numbers.add(String(value));
		} else if (typeof value === "string") {
			for (const match of value.matchAll(/(?:^|[^a-z0-9])0*(\d{1,3}(?:\.\d+)?)(?=$|[^0-9])/gi)) {
				numbers.add(String(Number(match[1])));
			}
		}
	}
	return numbers;
}

// Share of the smaller token set found in the larger one.
export function tokenOverlap(left: Set<string>, right: Set<string>): number {
	if (left.size === 0 || right.size === 0) {
		return 0;
	}
	const [small, large] = left.size <= right.size ? [left, right] : [right, left];
	let shared = 0;
	for (const token of small) {
		if (large.has(token)) shared += 1;
	}
	return shared / small.size;
}

// Same file, or the same book in another file: duration within 0.2% (at
// least 30s, a re-upload of the same recording matches to the second), no
// conflicting book numbers, and a matching title (or author plus some title).
export async function findDuplicateBook(candidate: {
	checksum: string;
	title: string;
	author: string;
	series?: string | null;
	durationSeconds: number;
}): Promise<DuplicateMatch | null> {
	const books = booksCollection();

	const sameFile = await books.findOne({ checksum: candidate.checksum }, { projection: { title: 1 } });
	if (sameFile) {
		return { bookId: String(sameFile._id), title: String(sameFile.title), reason: "checksum" };
	}

	const tolerance = Math.max(30, candidate.durationSeconds * 0.002);
	const nearby = await books
		.find(
			{ duration: { $gte: candidate.durationSeconds - tolerance, $lte: candidate.durationSeconds + tolerance } },
			{ projection: { title: 1, author: 1, series: 1, seriesIndex: 1 } },
		)
		.limit(50)
		.toArray();

	const titleTokens = identityTokens(`${candidate.title} ${candidate.series ?? ""}`);
	const authorTokens = identityTokens(candidate.author);
	const numbers = bookNumbers(candidate.title);
	for (const book of nearby) {
		const bookTitle = identityTokens(`${String(book.title ?? "")} ${String(book.series ?? "")}`);
		const bookAuthor = identityTokens(String(book.author ?? ""));
		const bookNums = bookNumbers(String(book.title ?? ""), book.seriesIndex as number | null);
		// "Book 2" and "Book 3" of a series are never the same book.
		if (numbers.size > 0 && bookNums.size > 0 && ![...numbers].some((n) => bookNums.has(n))) {
			continue;
		}
		const titleScore = tokenOverlap(titleTokens, bookTitle);
		const authorScore = tokenOverlap(authorTokens, bookAuthor);
		if (titleScore >= 0.6 || (authorScore >= 0.5 && titleScore >= 0.3)) {
			return { bookId: String(book._id), title: String(book.title), reason: "title_duration" };
		}
	}

	return null;
}

// Keeps a skipped upload for review instead of deleting it.
export async function parkDuplicateSource(sourcePath: string): Promise<string> {
	const target = path.join(DUPLICATES_DIR, path.basename(sourcePath));
	await fileService.moveFile(sourcePath, target);
	return target;
}

export async function removeOrphanBooks(): Promise<number> {
	const books = booksCollection();
	const orphans = await books
		.find(
			{
				$or: [{ filePath: null }, { filePath: { $exists: false } }],
				createdAt: { $lt: new Date(Date.now() - ORPHAN_MIN_AGE_MS) },
			},
			{ projection: { _id: 1 } },
		)
		.toArray();

	for (const orphan of orphans) {
		await books.deleteOne({ _id: orphan._id });
		await fileService.deleteDir(path.join(AUDIOBOOKS_PATH, String(orphan._id)));
	}
	return orphans.length;
}

export async function reserveBookDocument(
	bookData: Record<string, unknown>,
	audioFileName: string,
): Promise<ReservedBook> {
	const bookId = new mongoose.Types.ObjectId();
	const bookDir = path.join(AUDIOBOOKS_PATH, String(bookId));
	const audioPath = path.join(bookDir, audioFileName);

	await booksCollection().insertOne({
		...bookData,
		_id: bookId,
		filePath: audioPath,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	return { bookId, bookDir, audioPath };
}

export async function discardReservedBook(reserved: ReservedBook | null): Promise<void> {
	if (!reserved) {
		return;
	}
	await booksCollection().deleteOne({ _id: reserved.bookId }).catch(() => undefined);
	await fileService.deleteDir(reserved.bookDir);
}
