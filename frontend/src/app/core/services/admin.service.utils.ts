/**
 * ============================================================
 * admin.service.utils.ts
 * ============================================================
 *
 * Pure helper functions that keep form-data construction and
 * realtime-stream wiring separate from AdminService's endpoint
 * definitions.
 *
 * Functions:
 *   buildBookUploadForm(file, lang, cover?)  — build FormData for book upload
 *   buildCoverUploadForm(coverFile)          — build FormData for cover-only upload
 *   startJobsRealtimeStream(realtime, opts)  — subscribe to job.state.changed events
 *     and return a JobEventStreamHandle that can be stopped by the caller
 * ============================================================
 */
import { Subscription } from 'rxjs';

import type { RealtimeService } from './realtime.service';
import type { AdminJob, JobEventStreamHandle } from './admin.types';

// Admin service helpers: isolate form-data and realtime stream wiring from endpoint definitions.
export function buildBookUploadForm(file: File, language: 'fr' | 'en', coverFile?: File | null): FormData {
  const form = new FormData();
  form.append('file', file);
  form.append('language', language);

  if (coverFile) {
    form.append('cover', coverFile);
  }

  return form;
}

export function buildCoverUploadForm(coverFile: File): FormData {
  const form = new FormData();
  form.append('cover', coverFile);
  return form;
}

export function startJobsRealtimeStream(
  realtime: RealtimeService,
  options: {
    onJobs: (jobs: AdminJob[]) => void;
    onConnectionState?: (connected: boolean, mode: 'stream' | 'poll') => void;
    onError?: (message: string) => void;
  },
): JobEventStreamHandle {
  realtime.connect();
  options.onConnectionState?.(realtime.connected(), 'stream');

  const subscriptions: Subscription[] = [];
  const stateTimer = setInterval(() => {
    options.onConnectionState?.(realtime.connected(), 'stream');
  }, 1200);

  subscriptions.push(
    realtime.on<{ job?: AdminJob }>('job.state.changed').subscribe({
      next: (payload) => {
        if (payload.job) {
          options.onJobs([payload.job]);
        }
      },
      error: () => options.onError?.('Realtime job updates unavailable'),
    }),
  );

  subscriptions.push(
    realtime.events$.subscribe(() => {
      options.onConnectionState?.(realtime.connected(), 'stream');
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