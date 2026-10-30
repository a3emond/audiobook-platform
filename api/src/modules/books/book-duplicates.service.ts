/**
 * Finds books that are the same audiobook (same file, or same recording under
 * different metadata) and merges them: listening progress, listening history
 * and collection membership move to the copy that is kept, then the other
 * copies are queued for deletion.
 *
 * The matching rules mirror the worker's ingest duplicate guard
 * (worker/src/services/ingest-guard.service.ts) so a book flagged here would
 * also have been skipped on upload.
 */
import mongoose from "mongoose";

import { ApiError } from "../../utils/api-error.js";
import { CollectionModel } from "../collections/collection.model.js";
import { ProgressModel } from "../progress/progress.model.js";
import { ListeningSessionModel } from "../stats/listening-session.model.js";
import { BookModel } from "./book.model.js";
import { BookService } from "./book.service.js";

const STOP_WORDS = new Set([
	"a", "an", "the", "of", "and", "in", "on", "to", "book", "volume", "vol", "part",
	"unabridged", "abridged", "audiobook", "litrpg", "adventure", "series", "novel", "epic",
	"progression", "fantasy", "le", "la", "les", "de", "du", "des", "tome", "livre",
]);

export interface DuplicateBookDTO {
	id: string;
	title: string;
	author: string;
	series: string | null;
	seriesIndex: number | null;
	duration: number;
	coverPath: string | null;
	version: number;
	createdAt: string | null;
	listeners: number;
	finishedBy: number;
	bestPercent: number;
}

export interface DuplicateGroupDTO {
	reason: "same_file" | "same_recording";
	books: DuplicateBookDTO[];
	suggestedKeepId: string;
}

function identityTokens(value: string): Set<string> {
	return new Set(
		value
			.toLocaleLowerCase()
			.normalize("NFKD")
			.replace(/[̀-ͯ]/g, "")
			.split(/[^a-z0-9]+/)
			.filter((token) => token.length > 1 && !STOP_WORDS.has(token) && !/^0*\d{1,3}$/.test(token)),
	);
}

function bookNumbers(title: string, seriesIndex: number | null | undefined): Set<string> {
	const numbers = new Set<string>();
	if (typeof seriesIndex === "number" && Number.isFinite(seriesIndex)) {
		numbers.add(String(seriesIndex));
	}
	for (const match of title.matchAll(/(?:^|[^a-z0-9])0*(\d{1,3}(?:\.\d+)?)(?=$|[^0-9])/gi)) {
		numbers.add(String(Number(match[1])));
	}
	return numbers;
}

function tokenOverlap(left: Set<string>, right: Set<string>): number {
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

type CatalogBook = {
	_id: mongoose.Types.ObjectId;
	title: string;
	author: string;
	series?: string | null;
	seriesIndex?: number | null;
	duration: number;
	checksum: string;
	coverPath?: string | null;
	version?: number;
	createdAt?: Date;
};

export class BookDuplicatesService {
	static async findGroups(): Promise<DuplicateGroupDTO[]> {
		const books = (await BookModel.find({}, {
			title: 1, author: 1, series: 1, seriesIndex: 1, duration: 1, checksum: 1, coverPath: 1, version: 1, createdAt: 1,
		})
			.sort({ duration: 1 })
			.lean()) as unknown as CatalogBook[];

		// Union-find over matching pairs so chains (A~B, B~C) form one group.
		const parent = books.map((_, index) => index);
		const reasonOf = new Map<number, DuplicateGroupDTO["reason"]>();
		const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index])));
		const link = (a: number, b: number, reason: DuplicateGroupDTO["reason"]) => {
			const rootA = find(a);
			const rootB = find(b);
			if (rootA !== rootB) parent[rootB] = rootA;
			const root = find(a);
			if (reason === "same_recording" || !reasonOf.has(root)) reasonOf.set(root, reason);
		};

		const byChecksum = new Map<string, number>();
		books.forEach((book, index) => {
			const seen = byChecksum.get(book.checksum);
			if (seen !== undefined) link(seen, index, "same_file");
			else byChecksum.set(book.checksum, index);
		});

		const tokens = books.map((book) => ({
			title: identityTokens(`${book.title} ${book.series ?? ""}`),
			author: identityTokens(book.author ?? ""),
			numbers: bookNumbers(book.title, book.seriesIndex),
		}));

		// Books are sorted by duration, so only a short window needs comparing.
		for (let i = 0; i < books.length; i += 1) {
			const tolerance = Math.max(30, books[i].duration * 0.002);
			for (let j = i + 1; j < books.length && books[j].duration - books[i].duration <= tolerance; j += 1) {
				const a = tokens[i];
				const b = tokens[j];
				if (a.numbers.size > 0 && b.numbers.size > 0 && ![...a.numbers].some((n) => b.numbers.has(n))) {
					continue;
				}
				const titleScore = tokenOverlap(a.title, b.title);
				if (titleScore >= 0.6 || (tokenOverlap(a.author, b.author) >= 0.5 && titleScore >= 0.3)) {
					link(i, j, "same_recording");
				}
			}
		}

		const groups = new Map<number, number[]>();
		books.forEach((_, index) => {
			const root = find(index);
			groups.set(root, [...(groups.get(root) ?? []), index]);
		});
		const duplicateGroups = Array.from(groups.entries()).filter(([, members]) => members.length > 1);
		if (duplicateGroups.length === 0) {
			return [];
		}

		const ids = duplicateGroups.flatMap(([, members]) => members.map((index) => books[index]._id));
		const progressRows = await ProgressModel.aggregate<{ _id: mongoose.Types.ObjectId; listeners: number; finishedBy: number; best: number }>([
			{ $match: { bookId: { $in: ids } } },
			{
				$group: {
					_id: "$bookId",
					listeners: { $sum: 1 },
					finishedBy: { $sum: { $cond: ["$completed", 1, 0] } },
					best: { $max: { $cond: [{ $gt: ["$durationAtSave", 0] }, { $divide: ["$positionSeconds", "$durationAtSave"] }, 0] } },
				},
			},
		]);
		const progressById = new Map(progressRows.map((row) => [String(row._id), row]));

		return duplicateGroups
			.map(([root, members]) => {
				const groupBooks: DuplicateBookDTO[] = members.map((index) => {
					const book = books[index];
					const progress = progressById.get(String(book._id));
					return {
						id: String(book._id),
						title: book.title,
						author: book.author,
						series: book.series ?? null,
						seriesIndex: book.seriesIndex ?? null,
						duration: book.duration,
						coverPath: book.coverPath ?? null,
						version: book.version ?? 1,
						createdAt: book.createdAt ? new Date(book.createdAt).toISOString() : null,
						listeners: progress?.listeners ?? 0,
						finishedBy: progress?.finishedBy ?? 0,
						bestPercent: Math.min(100, Math.round((progress?.best ?? 0) * 100)),
					};
				});

				// Keep the copy people actually listened to; otherwise the oldest,
				// which carries the cleaned-up metadata.
				const suggested = [...groupBooks].sort(
					(a, b) =>
						b.finishedBy - a.finishedBy ||
						b.listeners - a.listeners ||
						b.bestPercent - a.bestPercent ||
						String(a.createdAt).localeCompare(String(b.createdAt)),
				)[0];

				return { reason: reasonOf.get(root) ?? "same_recording", books: groupBooks, suggestedKeepId: suggested.id };
			})
			.sort((a, b) => a.books[0].title.localeCompare(b.books[0].title));
	}

	// Moves everything that points at the removed copies onto the kept one, then
	// queues the removed copies for deletion through the normal delete job.
	static async resolve(keepId: string, removeIds: string[]): Promise<{ removed: number; jobIds: string[]; progressMoved: number }> {
		const unique = Array.from(new Set(removeIds.map(String))).filter((id) => id !== keepId);
		if (!mongoose.Types.ObjectId.isValid(keepId) || unique.length === 0 || !unique.every((id) => mongoose.Types.ObjectId.isValid(id))) {
			throw new ApiError(400, "duplicates_invalid_ids");
		}

		const keep = new mongoose.Types.ObjectId(keepId);
		const remove = unique.map((id) => new mongoose.Types.ObjectId(id));
		const found = await BookModel.countDocuments({ _id: { $in: [keep, ...remove] } });
		if (found !== remove.length + 1) {
			throw new ApiError(404, "book_not_found");
		}

		let progressMoved = 0;
		const rows = await ProgressModel.find({ bookId: { $in: remove } }).lean();
		for (const row of rows) {
			const existing = await ProgressModel.findOne({ userId: row.userId, bookId: keep }).lean();
			const rowTime = row.lastListenedAt ? new Date(row.lastListenedAt).getTime() : 0;
			const existingTime = existing?.lastListenedAt ? new Date(existing.lastListenedAt).getTime() : -1;
			// A finished listen wins; otherwise the most recent position wins.
			const takeRow = !existing || (row.completed && !existing.completed) || (row.completed === existing.completed && rowTime > existingTime);

			if (takeRow) {
				if (existing) {
					await ProgressModel.deleteOne({ _id: existing._id });
				}
				await ProgressModel.updateOne({ _id: row._id }, { $set: { bookId: keep } });
				progressMoved += 1;
			} else {
				await ProgressModel.deleteOne({ _id: row._id });
			}
		}

		await ListeningSessionModel.updateMany({ bookId: { $in: remove } }, { $set: { bookId: keep } });

		const collections = await CollectionModel.find({ bookIds: { $in: remove } });
		const removeSet = new Set(unique);
		for (const collection of collections) {
			const next: mongoose.Types.ObjectId[] = [];
			const seen = new Set<string>();
			for (const id of collection.bookIds as unknown as mongoose.Types.ObjectId[]) {
				const target = removeSet.has(String(id)) ? keep : id;
				if (!seen.has(String(target))) {
					seen.add(String(target));
					next.push(target);
				}
			}
			collection.set("bookIds", next);
			await collection.save();
		}

		const jobIds: string[] = [];
		for (const id of unique) {
			jobIds.push(await BookService.enqueueDeleteBook(id));
		}

		return { removed: unique.length, jobIds, progressMoved };
	}
}
