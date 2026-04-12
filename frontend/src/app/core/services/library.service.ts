/**
 * ============================================================
 * library.service.ts
 * ============================================================
 *
 * Public catalog service. Mirrors the books, series, and collections
 * endpoints and injects a default language so most call-sites do not
 * need to pass one explicitly.
 *
 * Exported:
 *   LibraryService  — root-level injectable
 *   BookFilters     — shared filter bag for book / series list queries
 *   SeriesFilters   — alias of BookFilters scoped to series queries
 *
 * Methods:
 *   listBooks(filters?)             — Observable<ListBooksResponse>
 *   getBook(bookId)                 — Observable<Book>
 *   listSeries(filters?)            — Observable<ListSeriesResponse>
 *   getSeries(seriesName)           — Observable<SeriesDetail>
 *   getCollection(collectionId)     — Observable<Collection>
 *   listCollections(limit, offset)  — Observable<ListCollectionsResponse>
 *   createCollection(name)          — Observable<Collection>
 *   updateCollection(id, payload)   — Observable<Collection>
 *   deleteCollection(id)            — Observable<void>
 * ============================================================
 */
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import type {
  Book,
  Collection,
  ListBooksResponse,
  ListCollectionsResponse,
  ListSeriesResponse,
  SeriesDetail,
} from '../models/api.models';
import { ApiService } from './api.service';

export interface BookFilters {
  [key: string]: string | number | boolean | undefined;
  q?: string;
  author?: string;
  series?: string;
  tags?: string;
  genre?: string;
  language?: string;
  sort?: 'alphabetical' | 'activity' | 'relevance';
  limit?: number;
  offset?: number;
}

export interface SeriesFilters extends BookFilters {}

/** Mirrors public catalog endpoints; injects a default language for most queries. */
@Injectable({ providedIn: 'root' })
export class LibraryService {
  constructor(private readonly api: ApiService) {}

  // Public catalog queries.
  listBooks(filters: BookFilters = {}): Observable<ListBooksResponse> {
    return this.api.get<ListBooksResponse>('/books', { params: this.withDefaultLanguage(filters) });
  }

  getBook(bookId: string): Observable<Book> {
    return this.api.get<Book>(`/books/${bookId}`);
  }

  listSeries(filters: SeriesFilters = {}): Observable<ListSeriesResponse> {
    return this.api.get<ListSeriesResponse>('/series', { params: this.withDefaultLanguage(filters) });
  }

  getSeries(seriesName: string): Observable<SeriesDetail> {
    return this.api.get<SeriesDetail>(`/series/${encodeURIComponent(seriesName)}`, {
      params: this.withDefaultLanguage({}),
    });
  }

  getCollection(collectionId: string): Observable<Collection> {
    return this.api.get<Collection>(`/collections/${collectionId}`);
  }

  listCollections(limit = 20, offset = 0): Observable<ListCollectionsResponse> {
    return this.api.get<ListCollectionsResponse>('/collections', { params: { limit, offset } });
  }

  createCollection(name: string): Observable<Collection> {
    return this.api.post<Collection, { name: string }>('/collections', { name });
  }

  updateCollection(collectionId: string, payload: { name?: string; bookIds?: string[] }): Observable<Collection> {
    return this.api.patch<Collection, { name?: string; bookIds?: string[] }>(`/collections/${collectionId}`, payload);
  }

  deleteCollection(collectionId: string): Observable<void> {
    return this.api.delete<void>(`/collections/${collectionId}`);
  }

  // Locale fallback keeps browsing consistent with the currently selected UI language.
  private withDefaultLanguage<T extends BookFilters>(filters: T): T {
    if (filters.language) {
      return filters;
    }

    const persisted = localStorage.getItem('app.locale');
    const language = persisted === 'fr' || persisted === 'en' ? persisted : 'en';
    return {
      ...filters,
      language,
    };
  }
}
