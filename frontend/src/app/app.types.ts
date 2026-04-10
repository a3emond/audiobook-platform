import type { Book, Progress } from './core/models/api.models';

export interface InProgressBookItem {
  book: Book;
  progress: Progress;
}

export interface ToastItem {
  id: string;
  text: string;
}