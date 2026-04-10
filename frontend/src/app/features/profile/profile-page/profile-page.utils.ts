import type { Book, ListeningSession } from '../../../core/models/api.models';
import type { HistoryBookRow, ThresholdOption } from './profile-page.types';

export function closestOption(value: number, options: readonly number[]): number {
  return options.reduce((best, current) => {
    return Math.abs(current - value) < Math.abs(best - value) ? current : best;
  }, options[0] ?? value);
}

export function closestThreshold(value: number, thresholdOptions: ThresholdOption[]): number {
  const thresholds = thresholdOptions.map((option) => option.seconds);
  return closestOption(value, thresholds);
}

export function formatDuration(totalSeconds: number): string {
  const value = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;

  return `${String(days).padStart(2, '0')}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

export function filterHistoryRows(rows: HistoryBookRow[], query: string): HistoryBookRow[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return rows;
  }

  return rows.filter((item) => {
    const title = item.book?.title ?? '';
    const author = item.book?.author ?? '';
    const haystack = `${title} ${author} ${item.bookId}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

export function historyTitle(item: HistoryBookRow): string {
  return item.book?.title ?? `Book ${item.bookId.slice(0, 8)}`;
}

export function historyAuthor(item: HistoryBookRow): string {
  return item.book?.author ?? 'Unknown author';
}

export function groupSessionsByBook(
  sessions: ListeningSession[],
  booksById: Map<string, Book>,
): HistoryBookRow[] {
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
    const totalListenedSeconds = bookSessions.reduce((sum, s) => sum + (s.listenedSeconds || 0), 0);
    const sessionsCount = bookSessions.length;
    const averageSessionSeconds = sessionsCount > 0 ? Math.floor(totalListenedSeconds / sessionsCount) : 0;
    const lastListenedAt = bookSessions
      .map((s) => s.endedAt)
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
