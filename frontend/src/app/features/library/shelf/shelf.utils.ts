/**
 * Groups the catalog into shelf entries: one per series (books in reading
 * order) and one per standalone book, plus the orderings the shelf offers.
 */
import type { Book, Progress } from '../../../core/models/api.models';

export type ShelfSort = 'activity' | 'recent' | 'title' | 'author';
export type ShelfScope = 'all' | 'series' | 'standalone';

export const SHELF_SORTS: ShelfSort[] = ['activity', 'recent', 'title', 'author'];
export const SHELF_SCOPES: ShelfScope[] = ['all', 'series', 'standalone'];

export interface ShelfEntry {
  key: string;
  kind: 'series' | 'book';
  name: string;
  author: string;
  books: Book[];
  totalDuration: number;
  lastAddedAt: number;
  lastListenedAt: number;
  // Share of the entry's total running time listened, 0..1.
  ratio: number;
  finishedCount: number;
  startedCount: number;
}

type ProgressLookup = (bookId: string) => Progress | null;

function bookRatio(book: Book, progress: Progress | null): number {
  if (!progress) return 0;
  if (progress.completed) return 1;
  const total = book.duration > 0 ? book.duration : progress.durationAtSave;
  return total > 0 ? Math.min(0.999, Math.max(0, progress.positionSeconds / total)) : 0;
}

function byReadingOrder(a: Book, b: Book): number {
  const ai = a.seriesIndex ?? Number.POSITIVE_INFINITY;
  const bi = b.seriesIndex ?? Number.POSITIVE_INFINITY;
  return ai - bi || a.title.localeCompare(b.title, undefined, { numeric: true });
}

// Most common author across the books, so a series with a guest co-author
// still reads as one name.
function mainAuthor(books: Book[]): string {
  const counts = new Map<string, number>();
  for (const book of books) {
    counts.set(book.author, (counts.get(book.author) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

export function buildShelfEntries(books: Book[], progressFor: ProgressLookup): ShelfEntry[] {
  const seriesByKey = new Map<string, { name: string; books: Book[] }>();
  const entries: ShelfEntry[] = [];

  for (const book of books) {
    const series = book.series?.trim();
    if (series) {
      const key = series.toLocaleLowerCase();
      const group = seriesByKey.get(key) ?? { name: series, books: [] };
      group.books.push(book);
      seriesByKey.set(key, group);
    } else {
      entries.push(toEntry(`book:${book.id}`, 'book', book.title, [book], progressFor));
    }
  }

  for (const [key, group] of seriesByKey) {
    entries.push(toEntry(`series:${key}`, 'series', group.name, group.books.sort(byReadingOrder), progressFor));
  }
  return entries;
}

function toEntry(key: string, kind: ShelfEntry['kind'], name: string, books: Book[], progressFor: ProgressLookup): ShelfEntry {
  let totalDuration = 0;
  let listened = 0;
  let lastAddedAt = 0;
  let lastListenedAt = 0;
  let finishedCount = 0;
  let startedCount = 0;

  for (const book of books) {
    const progress = progressFor(book.id);
    const duration = Math.max(0, book.duration);
    const ratio = bookRatio(book, progress);
    totalDuration += duration;
    listened += duration * ratio;
    lastAddedAt = Math.max(lastAddedAt, book.createdAt ? Date.parse(book.createdAt) || 0 : 0);
    lastListenedAt = Math.max(lastListenedAt, progress?.lastListenedAt ? Date.parse(progress.lastListenedAt) || 0 : 0);
    if (progress?.completed) finishedCount += 1;
    else if (ratio > 0) startedCount += 1;
  }

  return {
    key,
    kind,
    name,
    author: mainAuthor(books),
    books,
    totalDuration,
    lastAddedAt,
    lastListenedAt,
    ratio: totalDuration > 0 ? listened / totalDuration : 0,
    finishedCount,
    startedCount,
  };
}

export function entryState(entry: ShelfEntry): 'finished' | 'in_progress' | 'unstarted' {
  if (entry.finishedCount === entry.books.length) return 'finished';
  if (entry.finishedCount > 0 || entry.startedCount > 0) return 'in_progress';
  return 'unstarted';
}

export function matchesScope(entry: ShelfEntry, scope: ShelfScope): boolean {
  return scope === 'all' || (scope === 'series' ? entry.kind === 'series' : entry.kind === 'book');
}

export interface ShelfBookFilter {
  q: string;
  genre: string;
  tags: string[];
  minDuration?: number;
  maxDuration?: number;
}

// Whether a book passes the shelf's search and facet filters; a series stays
// on the shelf when any of its books does.
export function bookMatches(book: Book, filter: ShelfBookFilter): boolean {
  if (filter.genre && book.genre !== filter.genre) return false;
  if (filter.tags.length > 0 && !filter.tags.every((tag) => book.tags?.includes(tag))) return false;
  if (filter.minDuration !== undefined && book.duration < filter.minDuration) return false;
  if (filter.maxDuration !== undefined && book.duration >= filter.maxDuration) return false;
  const words = filter.q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [book.title, book.author, book.series ?? '', ...(book.tags ?? [])].join(' ').toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function sortShelf(entries: ShelfEntry[], sort: ShelfSort): ShelfEntry[] {
  const byName = (a: ShelfEntry, b: ShelfEntry) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  const sorted = [...entries];
  switch (sort) {
    case 'recent':
      return sorted.sort((a, b) => b.lastAddedAt - a.lastAddedAt || byName(a, b));
    case 'title':
      return sorted.sort(byName);
    case 'author':
      return sorted.sort((a, b) => a.author.localeCompare(b.author, undefined, { sensitivity: 'base' }) || byName(a, b));
    default:
      // What you are listening to first, then the newest arrivals.
      return sorted.sort((a, b) => b.lastListenedAt - a.lastListenedAt || b.lastAddedAt - a.lastAddedAt || byName(a, b));
  }
}

// The book to pick up next: the one in progress, else the first not finished.
export function nextBook(entry: ShelfEntry, progressFor: ProgressLookup): Book | null {
  const inProgress = entry.books
    .filter((book) => {
      const progress = progressFor(book.id);
      return progress && !progress.completed && progress.positionSeconds > 0;
    })
    .sort((a, b) => Date.parse(progressFor(b.id)?.lastListenedAt ?? '') - Date.parse(progressFor(a.id)?.lastListenedAt ?? '') || 0);
  if (inProgress[0]) return inProgress[0];
  return entry.books.find((book) => !progressFor(book.id)?.completed) ?? null;
}

export function formatHours(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes}m`;
}
