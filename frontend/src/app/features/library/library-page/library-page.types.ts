import type { Book, Collection } from '../../../core/models/api.models';

export interface SeriesRail {
  id: string;
  name: string;
  books: Book[];
}

export interface RailState {
  overflow: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

export interface ProgressRow {
  bookId: string;
  completed: boolean;
  positionSeconds: number;
  lastListenedAt: string | null;
}

export interface CollectionPreviewUrl {
  bookId: string;
  url: string;
}

export interface CollectionDerivation {
  collections: Collection[];
  filteredCollections: Collection[];
}
export type ListenStatusFilter = 'all' | 'unstarted' | 'in_progress' | 'finished';
export type LengthFilter = 'any' | 'short' | 'medium' | 'long';
export type LibraryView = 'browse' | 'grid';
