import mongoose from "mongoose";

import type { JobType } from "../queue/job.types.js";

export interface WorkerQueueSettings {
  heavyJobTypes: JobType[];
  heavyJobDelayMs: number;
  heavyWindowEnabled: boolean;
  heavyWindowStart: string;
  heavyWindowEnd: string;
}

const DEFAULT_SETTINGS: WorkerQueueSettings = {
  heavyJobTypes: ["INGEST_MP3_AS_M4B", "REPLACE_FILE"],
  heavyJobDelayMs: 0,
  heavyWindowEnabled: false,
  heavyWindowStart: "03:00",
  heavyWindowEnd: "05:00",
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
  private static cache: { value: WorkerQueueSettings; expiresAt: number } | null = null;

  static async getQueueSettings(forceRefresh = false): Promise<WorkerQueueSettings> {
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

  private static async fetchFromDb(): Promise<WorkerQueueSettings> {
    const db = mongoose.connection.db;
    if (!db) {
      return { ...DEFAULT_SETTINGS };
    }

    const doc = await db.collection("worker_settings").findOne({ key: "worker" });
    if (!doc || typeof doc !== "object") {
      return { ...DEFAULT_SETTINGS };
    }

    const queue = (doc as { queue?: Record<string, unknown> }).queue || {};

    const heavyJobTypes = Array.isArray(queue.heavyJobTypes)
      ? queue.heavyJobTypes.filter((item): item is JobType => typeof item === "string")
      : DEFAULT_SETTINGS.heavyJobTypes;

    return {
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
    };
  }
}
