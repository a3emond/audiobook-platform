/**
 * ============================================================
 * admin.service.ts
 * ============================================================
 *
 * Groups all backend admin endpoints so admin feature components
 * can stay thin and declarative.
 *
 * Exported:
 *   AdminService — root-level injectable
 *   (plus re-exports of all types from admin.types.ts for convenience)
 *
 * Method groups:
 *   Catalog:  listAdminBooks, getOverview, getCoverage, getBook
 *   Jobs:     uploadBook, uploadMp3AsM4b, listJobs, enqueueAdminJob,
 *             getJob, startJobsStream, getJobLogs, searchLogs
 *   Worker:   getWorkerSettings, updateWorkerSettings
 *   Users:    listUsers, getUser, updateUserRole,
 *             listUserSessions, revokeUserSessions
 *   Books:    updateBookMetadata, updateBookChapters, extractBookCover,
 *             replaceBookCover, deleteBook
 * ============================================================
 */
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from './api.service';
import { RealtimeService } from './realtime.service';
import type {
  AdminCoverage,
  AdminEditorialCatalogOptions,
  AdminEditorialBlock,
  AdminJob,
  AdminOverview,
  AdminUser,
  CreateAdminEditorialBlockPayload,
  Book,
  GetJobLogsResponse,
  JobEventStreamHandle,
  ListAdminUserSessionsResponse,
  ListAdminUsersResponse,
  ListBooksResponse,
  ListJobsResponse,
  SearchLogsResponse,
  ReplaceAdminEditorialItemsPayload,
  UpdateAdminEditorialBlockPayload,
  UpdateBookChaptersPayload,
  UpdateBookMetadataPayload,
  WorkerSettings,
} from './admin.types';
import { buildBookUploadForm, buildCoverUploadForm, startJobsRealtimeStream } from './admin.service.utils';
export type {
  AdminCoverage,
  AdminJob,
  AdminOverview,
  AdminUserSession,
  AdminUser,
  GetJobLogsResponse,
  JobLog,
  JobEventStreamHandle,
  ListAdminUserSessionsResponse,
  ListAdminUsersResponse,
  ListJobsResponse,
  SearchLogsResponse,
  WorkerSettings,
  WorkerQueueSettings,
} from './admin.types';

@Injectable({ providedIn: 'root' })
// AdminService groups backend admin endpoints so admin features can stay thin
// and mostly declarative.
export class AdminService {
  constructor(
    private readonly api: ApiService,
    private readonly realtime: RealtimeService,
  ) {}

  // Catalog and dashboard queries.
  listAdminBooks(limit = 20, offset = 0): Observable<ListBooksResponse> {
    return this.api.get<ListBooksResponse>('/admin/books', { params: { limit, offset } });
  }

  getOverview(): Observable<AdminOverview> {
    return this.api.get<AdminOverview>('/admin/overview');
  }

  getCoverage(): Observable<AdminCoverage> {
    return this.api.get<AdminCoverage>('/admin/coverage');
  }

  getEditorialCatalogOptions(): Observable<AdminEditorialCatalogOptions> {
    return this.api.get<AdminEditorialCatalogOptions>('/admin/editorial/options');
  }

  listEditorialBlocks(): Observable<{ blocks: AdminEditorialBlock[] }> {
    return this.api.get<{ blocks: AdminEditorialBlock[] }>('/admin/editorial/blocks');
  }

  createEditorialBlock(payload: CreateAdminEditorialBlockPayload): Observable<AdminEditorialBlock> {
    return this.api.post<AdminEditorialBlock, CreateAdminEditorialBlockPayload>('/admin/editorial/blocks', payload);
  }

  updateEditorialBlock(blockId: string, payload: UpdateAdminEditorialBlockPayload): Observable<AdminEditorialBlock> {
    return this.api.patch<AdminEditorialBlock, UpdateAdminEditorialBlockPayload>(`/admin/editorial/blocks/${blockId}`, payload);
  }

  replaceEditorialBlockItems(blockId: string, payload: ReplaceAdminEditorialItemsPayload): Observable<AdminEditorialBlock> {
    return this.api.put<AdminEditorialBlock, ReplaceAdminEditorialItemsPayload>(`/admin/editorial/blocks/${blockId}/items`, payload);
  }

  deleteEditorialBlock(blockId: string): Observable<{ deleted: true }> {
    return this.api.delete<{ deleted: true }>(`/admin/editorial/blocks/${blockId}`);
  }

  // Uploads enqueue worker jobs rather than completing synchronously in the request.
  uploadBook(file: File, language: 'fr' | 'en'): Observable<{ jobId: string }> {
    return this.api.postFormData<{ jobId: string }>('/admin/books/upload', buildBookUploadForm(file, language));
  }

  uploadMp3AsM4b(
    file: File,
    language: 'fr' | 'en',
    coverFile?: File | null,
  ): Observable<{ jobId: string }> {
    return this.api.postFormData<{ jobId: string }>(
      '/admin/books/upload/mp3',
      buildBookUploadForm(file, language, coverFile),
    );
  }

  listJobs(limit = 25, offset = 0): Observable<ListJobsResponse> {
    return this.api.get<ListJobsResponse>('/admin/jobs', { params: { limit, offset } });
  }

  // Generic job enqueue remains available for admin actions that are not file uploads.
  enqueueAdminJob(
    type: 'INGEST' | 'INGEST_MP3_AS_M4B' | 'RESCAN' | 'SYNC_TAGS' | 'WRITE_METADATA' | 'EXTRACT_COVER' | 'REPLACE_COVER' | 'DELETE_BOOK' | 'REPLACE_FILE',
    payload: Record<string, unknown>,
  ): Observable<AdminJob> {
    return this.api.post<AdminJob, { type: string; payload: Record<string, unknown> }>('/admin/jobs/enqueue', {
      type,
      payload,
    });
  }

  triggerCoverOverrideRemediation(): Observable<{ queued: boolean; jobId: string }> {
    return this.api.post<{ queued: boolean; jobId: string }, Record<string, never>>(
      '/admin/jobs/remediate-cover-overrides',
      {},
    );
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

  // The realtime helper encapsulates websocket-vs-poll fallback logic for job updates.
  startJobsStream(options: {
    onJobs: (jobs: AdminJob[]) => void;
    onConnectionState?: (connected: boolean, mode: 'stream' | 'poll') => void;
    onError?: (message: string) => void;
  }): JobEventStreamHandle {
    return startJobsRealtimeStream(this.realtime, options);
  }

  getBook(bookId: string): Observable<Book> {
    return this.api.get<Book>(`/admin/books/${bookId}`);
  }

  // User and moderation endpoints.
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

  // Book maintenance actions typically enqueue worker jobs so they can run outside request timeouts.
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
    return this.api.postFormData<{ queued: boolean; jobId: string }>(
      `/admin/books/${bookId}/cover`,
      buildCoverUploadForm(coverFile),
    );
  }

  deleteBook(bookId: string): Observable<{ queued: boolean; jobId: string }> {
    return this.api.delete<{ queued: boolean; jobId: string }>(`/admin/books/${bookId}`);
  }

  // Log access is parameterized because these lists can grow large quickly.
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
