import type { Book, Progress } from './core/models/api.models';
import { coverUrlForBook } from './core/utils/cover-url';

interface InProgressBookItem {
  book: Book;
  progress: Progress;
}

// App-level helpers: keep navbar/mini-player display math and progress list shaping outside the root component.
export function coverUrl(book: Book, token: string | null): string {
  return coverUrlForBook(book, token);
}

export function coverInitials(book: Book): string {
  const initials = (book.title ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return initials || 'BK';
}

export function miniPlayerProgressPercent(currentSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }

  const ratio = (currentSeconds / durationSeconds) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio)));
}

export function buildInProgressBooks(progressItems: Progress[], books: Book[]): InProgressBookItem[] {
  const filtered = [...progressItems]
    .filter((progress) => !progress.completed && progress.positionSeconds > 0)
    .sort((a, b) => {
      const aTime = a.lastListenedAt ? Date.parse(a.lastListenedAt) : 0;
      const bTime = b.lastListenedAt ? Date.parse(b.lastListenedAt) : 0;
      return bTime - aTime;
    });

  const byId = new Map(books.map((book) => [book.id, book]));
  return filtered
    .map((progress) => {
      const book = byId.get(progress.bookId);
      return book ? { book, progress } : null;
    })
    .filter((item): item is InProgressBookItem => item !== null)
    .slice(0, 24);
}

export function notificationId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}