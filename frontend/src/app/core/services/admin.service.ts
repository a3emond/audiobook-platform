import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import type { Book, ListBooksResponse } from '../models/api.models';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface AdminJob {
  id: string;
  type: string;
  status: string;
  updatedAt?: string;
  createdAt?: string;
  attempt?: number;
  maxAttempts?: number;
}

export interface AdminOverview {
  counts: {
    users: number;
    books: number;
    collections: number;
    jobs: number;
  };
  jobsByStatus: {
    queued: number;
    running: number;
    retrying: number;
    done: number;
    failed: number;
  };
}

export interface AdminCoverageItem {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  area: 'books' | 'jobs' | 'platform' | 'users';
  description: string;
}

export interface AdminCoverage {
  adminOnlyEndpoints: AdminCoverageItem[];
  notes: string[];
}

export interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
  profile: {
    displayName: string | null;
    preferredLocale: 'fr' | 'en';
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminUserSession {
  id: string;
  userId: string;
  device?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  expiresAt: string;
  lastUsedAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListAdminUsersResponse {
  users: AdminUser[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ListAdminUserSessionsResponse {
  sessions: AdminUserSession[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ListJobsResponse {
  jobs: AdminJob[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface JobEventStreamHandle {
  stop: () => void;
}

interface UpdateBookMetadataPayload {
  title?: string;
  author?: string;
  series?: string | null;
  seriesIndex?: number | null;
  genre?: string | null;
  tags?: string[];
  description?: {
    default?: string | null;
    fr?: string | null;
    en?: string | null;
  };
}

interface UpdateBookChaptersPayload {
  chapters: Array<{
    index: number;
    title: string;
    start: number;
    end: number;
  }>;
}

interface Mp3ConversionMetadataPayload {
  title?: string;
  author?: string;
  series?: string;
  genre?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {}

  listAdminBooks(limit = 20, offset = 0): Observable<ListBooksResponse> {
    return this.api.get<ListBooksResponse>('/admin/books', { params: { limit, offset } });
  }

  getOverview(): Observable<AdminOverview> {
    return this.api.get<AdminOverview>('/admin/overview');
  }

  getCoverage(): Observable<AdminCoverage> {
    return this.api.get<AdminCoverage>('/admin/coverage');
  }

  uploadBook(file: File): Observable<{ jobId: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.api.postFormData<{ jobId: string }>('/admin/books/upload', form);
  }

  uploadMp3AsM4b(
    file: File,
    metadata: Mp3ConversionMetadataPayload,
    coverFile?: File | null,
  ): Observable<{ jobId: string }> {
    const form = new FormData();
    form.append('file', file);

    if (coverFile) {
      form.append('cover', coverFile);
    }

    if (metadata.title) {
      form.append('title', metadata.title);
    }
    if (metadata.author) {
      form.append('author', metadata.author);
    }
    if (metadata.series) {
      form.append('series', metadata.series);
    }
    if (metadata.genre) {
      form.append('genre', metadata.genre);
    }

    return this.api.postFormData<{ jobId: string }>('/admin/books/upload/mp3', form);
  }

  listJobs(limit = 25, offset = 0): Observable<ListJobsResponse> {
    return this.api.get<ListJobsResponse>('/admin/jobs', { params: { limit, offset } });
  }

  getJob(jobId: string): Observable<AdminJob> {
    return this.api.get<AdminJob>(`/admin/jobs/${jobId}`);
  }

  startJobsStream(options: {
    onJobs: (jobs: AdminJob[]) => void;
    onConnectionState?: (connected: boolean, mode: 'stream' | 'poll') => void;
    onError?: (message: string) => void;
  }): JobEventStreamHandle {
    const controller = new AbortController();
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const stopPolling = (): void => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPolling = (): void => {
      if (pollTimer) {
        return;
      }

      options.onConnectionState?.(true, 'poll');
      const tick = (): void => {
        this.listJobs(25, 0).subscribe({
          next: (response) => options.onJobs(response.jobs),
          error: () => options.onError?.('Polling failed'),
        });
      };

      tick();
      pollTimer = setInterval(tick, 5000);
    };

    const readEventStream = async (): Promise<void> => {
      const token = this.auth.accessToken();
      if (!token) {
        throw new Error('Missing access token for job events stream');
      }

      const response = await fetch('/api/v1/admin/jobs/events', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Job events stream unavailable (${response.status})`);
      }

      options.onConnectionState?.(true, 'stream');
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const raw of chunks) {
          const lines = raw.split('\n');
          let eventName = 'message';
          const dataLines: string[] = [];

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
              continue;
            }
            if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trimStart());
            }
          }

          if (eventName !== 'jobs') {
            continue;
          }

          const payload = dataLines.join('\n');
          try {
            const parsed = JSON.parse(payload) as { jobs?: AdminJob[] };
            if (Array.isArray(parsed.jobs)) {
              options.onJobs(parsed.jobs);
            }
          } catch {
            options.onError?.('Malformed job events payload');
          }
        }
      }
    };

    void readEventStream().catch((error: unknown) => {
      options.onConnectionState?.(false, 'stream');
      options.onError?.(error instanceof Error ? error.message : 'Stream unavailable, falling back to polling');
      startPolling();
    });

    return {
      stop: () => {
        stopped = true;
        stopPolling();
        controller.abort();
      },
    };
  }

  getBook(bookId: string): Observable<Book> {
    return this.api.get<Book>(`/admin/books/${bookId}`);
  }

  listUsers(query: { q?: string; role?: 'admin' | 'user'; limit?: number; offset?: number } = {}): Observable<ListAdminUsersResponse> {
    return this.api.get<ListAdminUsersResponse>('/admin/users', {
      params: {
        q: query.q,
        role: query.role,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  getUser(userId: string): Observable<AdminUser> {
    return this.api.get<AdminUser>(`/admin/users/${userId}`);
  }

  updateUserRole(userId: string, role: 'admin' | 'user'): Observable<AdminUser> {
    return this.api.patch<AdminUser, { role: 'admin' | 'user' }>(`/admin/users/${userId}/role`, { role });
  }

  listUserSessions(userId: string, limit = 20, offset = 0): Observable<ListAdminUserSessionsResponse> {
    return this.api.get<ListAdminUserSessionsResponse>(`/admin/users/${userId}/sessions`, {
      params: { limit, offset },
    });
  }

  revokeUserSessions(userId: string): Observable<{ revoked: number }> {
    return this.api.delete<{ revoked: number }>(`/admin/users/${userId}/sessions`);
  }

  updateBookMetadata(bookId: string, payload: UpdateBookMetadataPayload): Observable<Book> {
    return this.api.patch<Book, UpdateBookMetadataPayload>(`/admin/books/${bookId}/metadata`, payload);
  }

  updateBookChapters(bookId: string, payload: UpdateBookChaptersPayload): Observable<Book> {
    return this.api.patch<Book, UpdateBookChaptersPayload>(`/admin/books/${bookId}/chapters`, payload);
  }

  extractBookCover(bookId: string): Observable<{ queued: boolean; jobId: string }> {
    return this.api.post<{ queued: boolean; jobId: string }, Record<string, never>>(`/admin/books/${bookId}/extract-cover`, {});
  }

  replaceBookCover(bookId: string, coverFile: File): Observable<{ queued: boolean; jobId: string }> {
    const form = new FormData();
    form.append('cover', coverFile);
    return this.api.postFormData<{ queued: boolean; jobId: string }>(`/admin/books/${bookId}/cover`, form);
  }

  deleteBook(bookId: string): Observable<{ queued: boolean; jobId: string }> {
    return this.api.delete<{ queued: boolean; jobId: string }>(`/admin/books/${bookId}`);
  }
}
