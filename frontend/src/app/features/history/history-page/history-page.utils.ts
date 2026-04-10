import type { Book, ListeningSession } from '../../../core/models/api.models';
import type { HistoryBookRow } from './history-page.types';

// History page helpers: keep session grouping and display formatting outside the page component.
export function groupSessionsByBook(sessions: ListeningSession[], booksById: Map<string, Book>): HistoryBookRow[] {
  const grouped = new Map<string, ListeningSession[]>();

  for (const session of sessions) {
    const bucket = grouped.get(session.bookId);
    if (bucket) {
      bucket.push(session);
    } else {
      grouped.set(session.bookId, [session]);
    }
  }

  const rows: HistoryBookRow[] = [];
  for (const [bookId, bookSessions] of grouped.entries()) {
    const totalListenedSeconds = bookSessions.reduce((sum, session) => sum + (session.listenedSeconds || 0), 0);
    const sessionsCount = bookSessions.length;
    const averageSessionSeconds = sessionsCount > 0 ? Math.floor(totalListenedSeconds / sessionsCount) : 0;
    const lastListenedAt = bookSessions
      .map((session) => session.endedAt)
      .filter((date): date is string => !!date)
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

    rows.push({
      bookId,
      book: booksById.get(bookId) ?? null,
      sessions: sessionsCount,
      totalListenedSeconds,
      averageSessionSeconds,
      lastListenedAt,
    });
  }

  return rows.sort((a, b) => {
    const aTime = a.lastListenedAt ? Date.parse(a.lastListenedAt) : 0;
    const bTime = b.lastListenedAt ? Date.parse(b.lastListenedAt) : 0;
    return bTime - aTime;
  });
}

export function filterHistoryRows(rows: HistoryBookRow[], query: string): HistoryBookRow[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return rows;
  }

  return rows.filter((item) => {
    const title = item.book?.title ?? '';
    const author = item.book?.author ?? '';
    const haystack = `${title} ${author} ${item.bookId}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function historyTitle(item: HistoryBookRow): string {
  return item.book?.title ?? `Book ${item.bookId.slice(0, 8)}`;
}

export function historyAuthor(item: HistoryBookRow): string {
  return item.book?.author ?? 'Unknown author';
}

export function formatHistoryDuration(totalSeconds: number): string {
  const value = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}