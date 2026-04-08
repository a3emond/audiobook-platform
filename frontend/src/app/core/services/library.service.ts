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
  genre?: string;
  limit?: number;
  offset?: number;
}

export interface SeriesFilters extends BookFilters {}

@Injectable({ providedIn: 'root' })
export class LibraryService {
  constructor(private readonly api: ApiService) {}

  listBooks(filters: BookFilters = {}): Observable<ListBooksResponse> {
    return this.api.get<ListBooksResponse>('/books', { params: filters });
  }

  getBook(bookId: string): Observable<Book> {
    return this.api.get<Book>(`/books/${bookId}`);
  }

  listSeries(filters: SeriesFilters = {}): Observable<ListSeriesResponse> {
    return this.api.get<ListSeriesResponse>('/series', { params: filters });
  }

  getSeries(seriesName: string): Observable<SeriesDetail> {
    return this.api.get<SeriesDetail>(`/series/${encodeURIComponent(seriesName)}`);
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
}
