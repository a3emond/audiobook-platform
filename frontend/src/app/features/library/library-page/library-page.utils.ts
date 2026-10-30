import type { Book, Collection } from '../../../core/models/api.models';
import { coverUrlForBook } from '../../../core/utils/cover-url';
import type {
  CollectionDerivation,
  CollectionPreviewUrl,
  LengthFilter,
  ListenStatusFilter,
  ProgressRow,
} from './library-page.types';

export const AUTO_ACTIVITY_COLLECTION_ID = 'auto:listened';
export const GRID_PAGE_SIZE = 48;

// Duration buckets for the length filter, in seconds.
export const LENGTH_RANGES: Record<Exclude<LengthFilter, 'any'>, { min?: number; max?: number }> = {
  short: { max: 5 * 3600 },
  medium: { min: 5 * 3600, max: 15 * 3600 },
  long: { min: 15 * 3600 },
};

export function matchesListenStatus(
  status: ListenStatusFilter,
  progress: Pick<ProgressRow, 'completed' | 'positionSeconds'> | undefined,
): boolean {
  switch (status) {
    case 'finished':
      return progress?.completed === true;
    case 'in_progress':
      return !!progress && !progress.completed && progress.positionSeconds > 0;
    case 'unstarted':
      return !progress || (!progress.completed && progress.positionSeconds <= 0);
    default:
      return true;
  }
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