import type { Book, ListBooksResponse } from '../models/api.models';

export type { ListBooksResponse };

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
  heavyJobTypes: Array<'INGEST' | 'INGEST_MP3_AS_M4B' | 'SANITIZE_MP3_TO_M4B' | 'RESCAN' | 'SYNC_TAGS' | 'WRITE_METADATA' | 'EXTRACT_COVER' | 'REPLACE_COVER' | 'DELETE_BOOK' | 'REPLACE_FILE'>;
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

export interface WorkerTaxonomySettings {
  enabled: boolean;
  intervalMs: number;
}

export interface WorkerSettings {
  queue: WorkerQueueSettings;
  parity: WorkerParitySettings;
  taxonomy?: WorkerTaxonomySettings;
  updatedAt?: string;
}

export interface JobEventStreamHandle {
  stop: () => void;
}

export interface UpdateBookMetadataPayload {
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

export interface UpdateBookChaptersPayload {
  chapters: Array<{
    index: number;
    title: string;
    start: number;
    end: number;
  }>;
}

export type { Book };