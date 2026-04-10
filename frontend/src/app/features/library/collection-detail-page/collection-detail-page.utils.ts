import type { Book, Collection } from '../../../core/models/api.models';

export const AUTO_ACTIVITY_COLLECTION_ID = 'auto:listened';

// Collection detail helpers: keep activity ordering and editor filtering outside the component class.
export function computeListenedBookOrder(
  progress: Array<{ bookId: string; completed: boolean; positionSeconds: number; lastListenedAt: string | null }>,
): string[] {
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

export function orderedBooksFromIds(orderedIds: string[], books: Book[]): Book[] {
  const byId = new Map(books.map((book) => [book.id, book]));
  return orderedIds
    .map((id) => byId.get(id) ?? null)
    .filter((book): book is Book => book !== null);
}

export function deriveActivityCollection(name: string, orderedBooks: Book[]): Collection {
  return {
    id: AUTO_ACTIVITY_COLLECTION_ID,
    name,
    bookIds: orderedBooks.map((book) => book.id),
    updatedAt: new Date().toISOString(),
  };
}

export function filterEditorBooks(allBooks: Book[], query: string): Book[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return allBooks;
  }

  return allBooks.filter((book) => `${book.title} ${book.author}`.toLowerCase().includes(normalizedQuery));
}

export function syncVisibleBooks(allBooks: Book[], bookIds: string[]): Book[] {
  if (bookIds.length === 0) {
    return [];
  }

  const selected = new Set(bookIds);
  return allBooks.filter((book) => selected.has(book.id));
}