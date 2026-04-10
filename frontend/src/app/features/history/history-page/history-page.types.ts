import type { Book } from '../../../core/models/api.models';

export interface HistoryBookRow {
  bookId: string;
  book: Book | null;
  sessions: number;
  totalListenedSeconds: number;
  averageSessionSeconds: number;
  lastListenedAt: string | null;
}