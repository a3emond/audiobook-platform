import type { AdminJob } from './admin.types';
import type { UploadQueueItem } from './admin-upload-queue.service';

// Upload queue helpers: keep immutable queue updates and job tracking out of the service class.
export function createQueueItem(file: File, index: number): UploadQueueItem {
  const type: UploadQueueItem['type'] = file.name.toLowerCase().endsWith('.mp3') ? 'mp3' : 'audio';
  const id = `${Date.now()}-${index}-${file.name}`;

  if (type === 'mp3') {
    return {
      id,
      file,
      type,
      status: 'queued',
      mp3: { coverFile: null },
      language: 'en',
    };
  }

  return {
    id,
    file,
    type,
    status: 'queued',
    language: 'en',
  };
}

export function patchQueueItem(items: UploadQueueItem[], index: number, patch: Partial<UploadQueueItem>): UploadQueueItem[] {
  const nextItems = [...items];
  const current = nextItems[index];
  if (!current) {
    return items;
  }

  nextItems[index] = {
    ...current,
    ...patch,
  };
  return nextItems;
}

export function patchQueueItemById(
  items: UploadQueueItem[],
  itemId: string,
  mutate: (item: UploadQueueItem) => UploadQueueItem,
): UploadQueueItem[] {
  return items.map((item) => (item.id === itemId ? mutate(item) : item));
}

export function mergeTrackedJobs(current: Record<string, AdminJob>, jobs: AdminJob[], trackedIds: string[]): Record<string, AdminJob> {
  const tracked = new Set(trackedIds);
  const next = { ...current };
  for (const job of jobs) {
    if (tracked.has(job.id)) {
      next[job.id] = job;
    }
  }
  return next;
}

export function allTrackedJobsTerminal(trackedIds: string[], jobsById: Record<string, AdminJob>): boolean {
  return trackedIds.every((trackedJobId) => {
    const status = jobsById[trackedJobId]?.status;
    return status === 'done' || status === 'failed';
  });
}