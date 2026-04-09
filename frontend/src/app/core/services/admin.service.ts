import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Subscription } from 'rxjs';

import type { Book, ListBooksResponse } from '../models/api.models';
import { ApiService } from './api.service';
import { RealtimeService } from './realtime.service';

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

export interface JobLog {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: unknown;
  duration?: number;
}

export interface GetJobLogsResponse {
  jobId: string;
  logs: JobLog[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchLogsResponse {
  logs: Array<{
    jobId: string;
    jobType: string;
    timestamp: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    context?: unknown;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface ListJobsResponse {
  jobs: AdminJob[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface WorkerQueueSettings {
  heavyJobTypes: Array<'INGEST' | 'INGEST_MP3_AS_M4B' | 'SANITIZE_MP3_TO_M4B' | 'RESCAN' | 'WRITE_METADATA' | 'EXTRACT_COVER' | 'REPLACE_COVER' | 'DELETE_BOOK' | 'REPLACE_FILE'>;
  heavyJobDelayMs: number;
  heavyWindowEnabled: boolean;
  heavyWindowStart: string;
  heavyWindowEnd: string;
  heavyConcurrency: number;
  fastConcurrency: number;
}

export interface WorkerParitySettings {
  enabled: boolean;
  intervalMs: number;
}

export interface WorkerSettings {
  queue: WorkerQueueSettings;
  parity: WorkerParitySettings;
  updatedAt?: string;
}

export interface JobEventStreamHandle {
  stop: () => void;
}

interface UpdateBookMetadataPayload {
  title?: string;
  author?: string;
  series?: string | null;
  seriesIndex?: number | null;
  language?: 'en' | 'fr';
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

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(
    private readonly api: ApiService,
    private readonly realtime: RealtimeService,
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

  uploadBook(file: File, language: 'fr' | 'en'): Observable<{ jobId: string }> {
    const form = new FormData();
    form.append('file', file);
    form.append('language', language);
    return this.api.postFormData<{ jobId: string }>('/admin/books/upload', form);
  }

  uploadMp3AsM4b(
    file: File,
    language: 'fr' | 'en',
    coverFile?: File | null,
  ): Observable<{ jobId: string }> {
    const form = new FormData();
    form.append('file', file);
    form.append('language', language);

    if (coverFile) {
      form.append('cover', coverFile);
    }

    return this.api.postFormData<{ jobId: string }>('/admin/books/upload/mp3', form);
  }

  listJobs(limit = 25, offset = 0): Observable<ListJobsResponse> {
    return this.api.get<ListJobsResponse>('/admin/jobs', { params: { limit, offset } });
  }

  getWorkerSettings(): Observable<WorkerSettings> {
    return this.api.get<WorkerSettings>('/admin/worker-settings');
  }

  updateWorkerSettings(patch: Partial<WorkerSettings>): Observable<WorkerSettings> {
    return this.api.patch<WorkerSettings, Partial<WorkerSettings>>('/admin/worker-settings', patch);
  }

  getJob(jobId: string): Observable<AdminJob> {
    return this.api.get<AdminJob>(`/admin/jobs/${jobId}`);
  }

  startJobsStream(options: {
    onJobs: (jobs: AdminJob[]) => void;
    onConnectionState?: (connected: boolean, mode: 'stream' | 'poll') => void;
    onError?: (message: string) => void;
  }): JobEventStreamHandle {
    this.realtime.connect();
    options.onConnectionState?.(this.realtime.connected(), 'stream');

    const subscriptions: Subscription[] = [];
    const stateTimer = setInterval(() => {
      options.onConnectionState?.(this.realtime.connected(), 'stream');
    }, 1200);
    subscriptions.push(
      this.realtime.on<{ job?: AdminJob }>('job.state.changed').subscribe({
        next: (payload) => {
          if (payload.job) {
            options.onJobs([payload.job]);
          }
        },
        error: () => options.onError?.('Realtime job updates unavailable'),
      }),
    );

    subscriptions.push(
      this.realtime.events$.subscribe(() => {
        options.onConnectionState?.(this.realtime.connected(), 'stream');
      }),
    );

    return {
      stop: () => {
        clearInterval(stateTimer);
        for (const subscription of subscriptions) {
          subscription.unsubscribe();
        }
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

  getJobLogs(
    jobId: string,
    options?: { limit?: number; offset?: number; level?: 'debug' | 'info' | 'warn' | 'error' },
  ): Observable<GetJobLogsResponse> {
    return this.api.get<GetJobLogsResponse>(`/admin/jobs/${jobId}/logs`, {
      params: {
        limit: options?.limit ?? 100,
        offset: options?.offset ?? 0,
        level: options?.level,
      },
    });
  }

  searchLogs(options?: {
    jobType?: string;
    level?: 'debug' | 'info' | 'warn' | 'error';
    search?: string;
    limit?: number;
    offset?: number;
  }): Observable<SearchLogsResponse> {
    return this.api.get<SearchLogsResponse>('/admin/logs', {
      params: {
        jobType: options?.jobType,
        level: options?.level,
        search: options?.search,
        limit: options?.limit ?? 50,
        offset: options?.offset ?? 0,
      },
    });
  }
}
