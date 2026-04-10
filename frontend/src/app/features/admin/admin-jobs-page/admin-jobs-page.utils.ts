import type { AdminJob, WorkerQueueSettings, WorkerSettings } from '../../../core/services/admin.types';

export interface WorkerSettingsDraft extends WorkerQueueSettings {
  parityEnabled: boolean;
  parityIntervalMinutes: number;
}

// Admin jobs page helpers: keep immutable job merging and settings draft mapping out of the component.
export function mergeJobs(existingJobs: AdminJob[], incomingJobs: AdminJob[]): AdminJob[] {
  const merged = new Map(existingJobs.map((job) => [job.id, job]));
  for (const job of incomingJobs) {
    merged.set(job.id, job);
  }

  return Array.from(merged.values()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function toWorkerSettingsDraft(settings: WorkerSettings): WorkerSettingsDraft {
  return {
    heavyJobTypes: [...settings.queue.heavyJobTypes],
    heavyJobDelayMs: settings.queue.heavyJobDelayMs,
    heavyWindowEnabled: settings.queue.heavyWindowEnabled,
    heavyWindowStart: settings.queue.heavyWindowStart,
    heavyWindowEnd: settings.queue.heavyWindowEnd,
    heavyConcurrency: settings.queue.heavyConcurrency,
    fastConcurrency: settings.queue.fastConcurrency,
    parityEnabled: settings.parity.enabled,
    parityIntervalMinutes: Math.max(1, Math.round(settings.parity.intervalMs / 60_000)),
  };
}

export function fromWorkerSettingsDraft(draft: WorkerSettingsDraft): Partial<WorkerSettings> {
  return {
    queue: {
      heavyJobTypes: [...draft.heavyJobTypes],
      heavyJobDelayMs: draft.heavyJobDelayMs,
      heavyWindowEnabled: draft.heavyWindowEnabled,
      heavyWindowStart: draft.heavyWindowStart,
      heavyWindowEnd: draft.heavyWindowEnd,
      heavyConcurrency: draft.heavyConcurrency,
      fastConcurrency: draft.fastConcurrency,
    },
    parity: {
      enabled: draft.parityEnabled,
      intervalMs: Math.max(60_000, Math.round(draft.parityIntervalMinutes) * 60_000),
    },
  };
}

export function toggleHeavyTypeSelection(
  draft: WorkerSettingsDraft,
  type: WorkerQueueSettings['heavyJobTypes'][number],
  checked: boolean,
): WorkerSettingsDraft {
  return {
    ...draft,
    heavyJobTypes: checked
      ? draft.heavyJobTypes.includes(type)
        ? draft.heavyJobTypes
        : [...draft.heavyJobTypes, type]
      : draft.heavyJobTypes.filter((value) => value !== type),
  };
}