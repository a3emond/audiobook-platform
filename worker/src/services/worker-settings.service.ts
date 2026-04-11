import mongoose from "mongoose";

import type { JobType } from "../queue/job.types.js";

export interface WorkerQueueSettings {
  heavyJobTypes: JobType[];
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

export interface WorkerRuntimeSettings {
  queue: WorkerQueueSettings;
  parity: WorkerParitySettings;
  taxonomy: WorkerTaxonomySettings;
}

const DEFAULT_SETTINGS: WorkerQueueSettings = {
  heavyJobTypes: ["SANITIZE_MP3_TO_M4B", "REPLACE_FILE"],
  heavyJobDelayMs: 0,
  heavyWindowEnabled: false,
  heavyWindowStart: "03:00",
  heavyWindowEnd: "05:00",
  heavyConcurrency: 1,
  fastConcurrency: 0,
};

const DEFAULT_PARITY_SETTINGS: WorkerParitySettings = {
  enabled: true,
  intervalMs: 3_600_000,
};

const DEFAULT_TAXONOMY_SETTINGS: WorkerTaxonomySettings = {
  enabled: true,
  intervalMs: 3_600_000,
};

function parseNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseMinutes(time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

export function isInWindow(now: Date, start: string, end: string): boolean {
  const startMinutes = parseMinutes(start);
  const endMinutes = parseMinutes(end);

  if (startMinutes === null || endMinutes === null) {
    return true;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (startMinutes === endMinutes) {
    return true;
  }

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

export class WorkerSettingsService {
  private static cache: { value: WorkerRuntimeSettings; expiresAt: number } | null = null;

  static async getQueueSettings(forceRefresh = false): Promise<WorkerQueueSettings> {
    const settings = await this.getRuntimeSettings(forceRefresh);
    return settings.queue;
  }

  static async getParitySettings(forceRefresh = false): Promise<WorkerParitySettings> {
    const settings = await this.getRuntimeSettings(forceRefresh);
    return settings.parity;
  }

  static async getTaxonomySettings(forceRefresh = false): Promise<WorkerTaxonomySettings> {
    const settings = await this.getRuntimeSettings(forceRefresh);
    return settings.taxonomy;
  }

  static async getRuntimeSettings(forceRefresh = false): Promise<WorkerRuntimeSettings> {
    const ttlMs = Math.max(1000, parseNumberEnv("WORKER_SETTINGS_REFRESH_MS", 15_000));
    const now = Date.now();

    if (!forceRefresh && this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    const loaded = await this.fetchFromDb();
    this.cache = {
      value: loaded,
      expiresAt: now + ttlMs,
    };

    return loaded;
  }

  private static async fetchFromDb(): Promise<WorkerRuntimeSettings> {
    const db = mongoose.connection.db;
    if (!db) {
      return {
        queue: { ...DEFAULT_SETTINGS },
        parity: { ...DEFAULT_PARITY_SETTINGS },
        taxonomy: { ...DEFAULT_TAXONOMY_SETTINGS },
      };
    }

    const doc = await db.collection("worker_settings").findOne({ key: "worker" });
    if (!doc || typeof doc !== "object") {
      return {
        queue: { ...DEFAULT_SETTINGS },
        parity: { ...DEFAULT_PARITY_SETTINGS },
        taxonomy: { ...DEFAULT_TAXONOMY_SETTINGS },
      };
    }

    const queue = (doc as { queue?: Record<string, unknown> }).queue || {};
    const parity = (doc as { parity?: Record<string, unknown> }).parity || {};
    const taxonomy = (doc as { taxonomy?: Record<string, unknown> }).taxonomy || {};

    const heavyJobTypes = Array.isArray(queue.heavyJobTypes)
      ? queue.heavyJobTypes.filter((item): item is JobType => typeof item === "string")
      : DEFAULT_SETTINGS.heavyJobTypes;

    return {
      queue: {
        heavyJobTypes: heavyJobTypes.length > 0 ? heavyJobTypes : DEFAULT_SETTINGS.heavyJobTypes,
        heavyJobDelayMs:
          typeof queue.heavyJobDelayMs === "number" && queue.heavyJobDelayMs >= 0
            ? Math.round(queue.heavyJobDelayMs)
            : DEFAULT_SETTINGS.heavyJobDelayMs,
        heavyWindowEnabled:
          typeof queue.heavyWindowEnabled === "boolean"
            ? queue.heavyWindowEnabled
            : DEFAULT_SETTINGS.heavyWindowEnabled,
        heavyWindowStart:
          typeof queue.heavyWindowStart === "string"
            ? queue.heavyWindowStart
            : DEFAULT_SETTINGS.heavyWindowStart,
        heavyWindowEnd:
          typeof queue.heavyWindowEnd === "string"
            ? queue.heavyWindowEnd
            : DEFAULT_SETTINGS.heavyWindowEnd,
        heavyConcurrency:
          typeof queue.heavyConcurrency === "number" && queue.heavyConcurrency >= 1
            ? Math.round(queue.heavyConcurrency)
            : DEFAULT_SETTINGS.heavyConcurrency,
        fastConcurrency:
          typeof queue.fastConcurrency === "number" && queue.fastConcurrency >= 0
            ? Math.round(queue.fastConcurrency)
            : DEFAULT_SETTINGS.fastConcurrency,
      },
      parity: {
        enabled:
          typeof parity.enabled === "boolean"
            ? parity.enabled
            : DEFAULT_PARITY_SETTINGS.enabled,
        intervalMs:
          typeof parity.intervalMs === "number" && parity.intervalMs >= 60_000
            ? Math.round(parity.intervalMs)
            : DEFAULT_PARITY_SETTINGS.intervalMs,
      },
      taxonomy: {
        enabled:
          typeof taxonomy.enabled === "boolean"
            ? taxonomy.enabled
            : DEFAULT_TAXONOMY_SETTINGS.enabled,
        intervalMs:
          typeof taxonomy.intervalMs === "number" && taxonomy.intervalMs >= 60_000
            ? Math.round(taxonomy.intervalMs)
            : DEFAULT_TAXONOMY_SETTINGS.intervalMs,
      },
    };
  }
}
