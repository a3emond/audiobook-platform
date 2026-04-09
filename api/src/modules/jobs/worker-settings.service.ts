import { ApiError } from "../../utils/api-error.js";
import { JOB_TYPES, type JobType } from "./job.model.js";
import { WorkerSettingsModel, type WorkerSettingsDocument } from "./worker-settings.model.js";

export interface WorkerSettingsDTO {
  queue: {
    heavyJobTypes: JobType[];
    heavyJobDelayMs: number;
    heavyWindowEnabled: boolean;
    heavyWindowStart: string;
    heavyWindowEnd: string;
    heavyConcurrency: number;
    fastConcurrency: number;
  };
  parity: {
    enabled: boolean;
    intervalMs: number;
  };
  updatedAt?: string;
}

interface WorkerSettingsPatchDTO {
  queue?: Partial<WorkerSettingsDTO["queue"]>;
  parity?: Partial<WorkerSettingsDTO["parity"]>;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseHeavyJobTypesEnv(fallback: JobType[]): JobType[] {
  const raw = process.env.HEAVY_JOB_TYPES;
  if (!raw) {
    return fallback;
  }

  const allowed = new Set<JobType>(JOB_TYPES);
  const parsed = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is JobType => allowed.has(item as JobType));

  return parsed.length > 0 ? parsed : fallback;
}

function toDto(doc: WorkerSettingsDocument): WorkerSettingsDTO {
  return {
    queue: {
      heavyJobTypes: [...doc.queue.heavyJobTypes],
      heavyJobDelayMs: doc.queue.heavyJobDelayMs,
      heavyWindowEnabled: doc.queue.heavyWindowEnabled,
      heavyWindowStart: doc.queue.heavyWindowStart,
      heavyWindowEnd: doc.queue.heavyWindowEnd,
      heavyConcurrency: doc.queue.heavyConcurrency,
      fastConcurrency: doc.queue.fastConcurrency,
    },
    parity: {
      enabled: doc.parity.enabled,
      intervalMs: doc.parity.intervalMs,
    },
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

export class WorkerSettingsService {
  private static cache: { expiresAt: number; value: WorkerSettingsDTO } | null = null;

  static async getSettings(refresh = false): Promise<WorkerSettingsDTO> {
    const ttlMs = Math.max(1000, parseNumberEnv("WORKER_SETTINGS_CACHE_TTL_MS", 15_000));
    const now = Date.now();

    if (!refresh && this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    const doc = await this.findOrCreate();
    const value = toDto(doc);
    this.cache = { value, expiresAt: now + ttlMs };

    return value;
  }

  static async updateSettings(patch: WorkerSettingsPatchDTO): Promise<WorkerSettingsDTO> {
    this.validatePatch(patch);

    const doc = await this.findOrCreate();
    if (patch.queue) {
      if (patch.queue.heavyJobTypes !== undefined) {
        doc.queue.heavyJobTypes = patch.queue.heavyJobTypes;
      }
      if (patch.queue.heavyJobDelayMs !== undefined) {
        doc.queue.heavyJobDelayMs = patch.queue.heavyJobDelayMs;
      }
      if (patch.queue.heavyWindowEnabled !== undefined) {
        doc.queue.heavyWindowEnabled = patch.queue.heavyWindowEnabled;
      }
      if (patch.queue.heavyWindowStart !== undefined) {
        doc.queue.heavyWindowStart = patch.queue.heavyWindowStart;
      }
      if (patch.queue.heavyWindowEnd !== undefined) {
        doc.queue.heavyWindowEnd = patch.queue.heavyWindowEnd;
      }
      if (patch.queue.heavyConcurrency !== undefined) {
        doc.queue.heavyConcurrency = patch.queue.heavyConcurrency;
      }
      if (patch.queue.fastConcurrency !== undefined) {
        doc.queue.fastConcurrency = patch.queue.fastConcurrency;
      }
    }
    if (patch.parity) {
      if (patch.parity.enabled !== undefined) {
        doc.parity.enabled = patch.parity.enabled;
      }
      if (patch.parity.intervalMs !== undefined) {
        doc.parity.intervalMs = patch.parity.intervalMs;
      }
    }

    await doc.save();
    const value = toDto(doc);
    this.cache = null;

    return value;
  }

  private static validatePatch(patch: WorkerSettingsPatchDTO): void {
    if (!patch.queue && !patch.parity) {
      return;
    }

    if (patch.queue?.heavyJobTypes !== undefined) {
      const allowed = new Set<JobType>(JOB_TYPES);
      const invalid = patch.queue.heavyJobTypes.some((item) => !allowed.has(item));
      if (invalid) {
        throw new ApiError(400, "worker_settings_invalid_job_types");
      }
    }

    if (patch.queue?.heavyJobDelayMs !== undefined && patch.queue.heavyJobDelayMs < 0) {
      throw new ApiError(400, "worker_settings_invalid_delay");
    }

    if (patch.queue?.heavyWindowStart !== undefined && !TIME_PATTERN.test(patch.queue.heavyWindowStart)) {
      throw new ApiError(400, "worker_settings_invalid_start_time");
    }

    if (patch.queue?.heavyWindowEnd !== undefined && !TIME_PATTERN.test(patch.queue.heavyWindowEnd)) {
      throw new ApiError(400, "worker_settings_invalid_end_time");
    }

    if (patch.queue?.heavyConcurrency !== undefined && (patch.queue.heavyConcurrency < 1 || !Number.isInteger(patch.queue.heavyConcurrency))) {
      throw new ApiError(400, "worker_settings_invalid_heavy_concurrency");
    }

    if (patch.queue?.fastConcurrency !== undefined && (patch.queue.fastConcurrency < 0 || !Number.isInteger(patch.queue.fastConcurrency))) {
      throw new ApiError(400, "worker_settings_invalid_fast_concurrency");
    }

    if (patch.parity?.intervalMs !== undefined) {
      if (patch.parity.intervalMs < 60_000 || !Number.isInteger(patch.parity.intervalMs)) {
        throw new ApiError(400, "worker_settings_invalid_parity_interval");
      }
    }
  }

  private static async findOrCreate(): Promise<WorkerSettingsDocument> {
    const existing = await WorkerSettingsModel.findOne({ key: "worker" });
    if (existing) {
      return existing;
    }

    return WorkerSettingsModel.create({
      key: "worker",
      queue: {
        heavyJobTypes: parseHeavyJobTypesEnv(["SANITIZE_MP3_TO_M4B", "REPLACE_FILE"]),
        heavyJobDelayMs: Math.max(0, parseNumberEnv("HEAVY_JOB_DELAY_MS", 0)),
        heavyWindowEnabled: String(process.env.HEAVY_JOB_WINDOW_ENABLED || "false") === "true",
        heavyWindowStart: process.env.HEAVY_JOB_WINDOW_START || "03:00",
        heavyWindowEnd: process.env.HEAVY_JOB_WINDOW_END || "05:00",
        heavyConcurrency: Math.max(1, parseNumberEnv("WORKER_CONCURRENCY_HEAVY", parseNumberEnv("WORKER_CONCURRENCY", 1))),
        fastConcurrency: Math.max(0, parseNumberEnv("WORKER_CONCURRENCY_FAST", 0)),
      },
      parity: {
        enabled: String(process.env.PARITY_SCAN_ENABLED || "true") === "true",
        intervalMs: Math.max(60_000, parseNumberEnv("PARITY_SCAN_INTERVAL_MS", 3_600_000)),
      },
    });
  }
}
