import type { Book } from '../models/api.models';

function revisionFromBook(book: Pick<Book, 'version' | 'updatedAt'>): string {
  if (Number.isFinite(book.version)) {
    return String(book.version);
  }

  if (book.updatedAt) {
    const timestamp = Date.parse(book.updatedAt);
    if (Number.isFinite(timestamp) && timestamp > 0) {
      return String(timestamp);
    }
  }

  return '1';
}

export function buildCoverUrl(bookId: string, token: string, revision: string | number): string {
  const params = new URLSearchParams();
  params.set('access_token', token);
  params.set('cv', String(revision));
  return `/streaming/books/${bookId}/cover?${params.toString()}`;
}

export function coverUrlForBook(book: Pick<Book, 'id' | 'coverPath' | 'version' | 'updatedAt'>, token: string | null): string {
  if (!book.coverPath || !token) {
    return '';
  }

  return buildCoverUrl(book.id, token, revisionFromBook(book));
}
