import type { Book, Collection, SeriesDetail, SeriesSummary } from '../../../core/models/api.models';
import { coverUrlForBook } from '../../../core/utils/cover-url';
import type {
  CollectionDerivation,
  CollectionPreviewUrl,
  ProgressRow,
  SeriesRail,
} from './library-page.types';

export const AUTO_ACTIVITY_COLLECTION_ID = 'auto:listened';
export const LATEST_BOOKS_LIMIT = 20;

// Library page helpers: keep collection and series data shaping outside the component class.
export function normalizeSeriesName(seriesName: string): string {
  return seriesName.trim().replace(/\s+/g, ' ');
}

export function normalizeSeriesKey(seriesName: string): string {
  return normalizeSeriesName(seriesName).toLocaleLowerCase();
}

// In-progress books are listed first, then completed, both sorted by last activity.
export function computeListenedBookOrder(progress: ProgressRow[]): string[] {
  const byLastListenedDesc = (a: { lastListenedAt: string | null }, b: { lastListenedAt: string | null }) => {
    const aTime = a.lastListenedAt ? Date.parse(a.lastListenedAt) : 0;
    const bTime = b.lastListenedAt ? Date.parse(b.lastListenedAt) : 0;
    return bTime - aTime;
  };

  const inProgress = progress
    .filter((item) => !item.completed && item.positionSeconds > 0)
    .sort(byLastListenedDesc)
    .map((item) => item.bookId);

  const completed = progress
    .filter((item) => item.completed)
    .sort(byLastListenedDesc)
    .map((item) => item.bookId);

  return [...new Set([...inProgress, ...completed])];
}

// Preview URLs are limited and only emitted for books that actually have a cover.
export function collectionPreviewUrls(
  collection: Collection,
  token: string | null,
  books: Book[],
): CollectionPreviewUrl[] {
  if (!token) {
    return [];
  }

  const ids = collection.bookIds.slice(0, 3);
  const byId = new Map(books.map((book) => [book.id, book]));

  return ids
    .map((id) => byId.get(id))
    .filter((book): book is Book => Boolean(book?.coverPath))
    .map((book) => ({
      bookId: book.id,
      url: coverUrlForBook(book, token),
    }))
    .filter((preview) => preview.url.length > 0);
}

// Deduping across rails ensures collection preview lookup stays O(1) with stable ids.
export function dedupeBooks(latestBooks: Book[], seriesRails: SeriesRail[]): Book[] {
  const all = [...latestBooks];
  for (const series of seriesRails) {
    all.push(...series.books);
  }

  const byId = new Map<string, Book>();
  for (const book of all) {
    if (!byId.has(book.id)) {
      byId.set(book.id, book);
    }
  }

  return Array.from(byId.values());
}

// Unique series trimming keeps homepage rails compact when API returns duplicate aliases.
export function uniqueTopSeries(series: SeriesSummary[], limit: number): SeriesSummary[] {
  const seenSeries = new Set<string>();
  return series
    .filter((entry) => {
      const normalizedName = normalizeSeriesName(entry.name);
      if (!normalizedName) {
        return false;
      }

      const key = normalizeSeriesKey(normalizedName);
      if (seenSeries.has(key)) {
        return false;
      }

      seenSeries.add(key);
      return true;
    })
    .slice(0, limit);
}

export function mapSeriesRails(seriesDetails: SeriesDetail[], filterBooks: (books: Book[]) => Book[]): SeriesRail[] {
  return seriesDetails
    .map((series) => ({
      id: series.id,
      name: series.name,
      books: filterBooks(series.books),
    }))
    .filter((series) => series.books.length > 0);
}

export function deriveCollections(
  listedCollections: Collection[],
  listenedBookIds: string[],
  query: string,
  activityLabel: string,
): CollectionDerivation {
  // Activity collection is synthetic and always pinned first.
  const autoCollection: Collection = {
    id: AUTO_ACTIVITY_COLLECTION_ID,
    name: activityLabel,
    bookIds: listenedBookIds,
    updatedAt: new Date().toISOString(),
  };
  const nonAutoCollections = listedCollections.filter((collection) => collection.id !== AUTO_ACTIVITY_COLLECTION_ID);
  const allCollections = [autoCollection, ...nonAutoCollections];

  const normalizedQuery = query.trim().toLowerCase();
  const filteredNonAuto = !normalizedQuery
    ? nonAutoCollections
    : nonAutoCollections.filter((collection) => collection.name.toLowerCase().includes(normalizedQuery));

  return {
    collections: allCollections,
    filteredCollections: [autoCollection, ...filteredNonAuto],
  };
}