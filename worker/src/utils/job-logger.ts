import mongoose from "mongoose";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface JobLogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  duration?: number; // milliseconds
}

/**
 * Structured job logger that collects logs in memory and persists to MongoDB
 * Provides context-aware logging with levels (debug, info, warn, error)
 */
export class JobLogger {
  private jobId: string;
  private entries: JobLogEntry[] = [];
  private ringbuffer: JobLogEntry[] = [];
  private maxRingbufferSize = 100;
  private startTimeMs: number;
  private persistedCount = 0;

  constructor(jobId: string) {
    this.jobId = jobId;
    this.startTimeMs = Date.now();
  }

  /**
   * Log at debug level (usually internal operation details)
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }

  /**
   * Log at info level (important milestones, state changes)
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  /**
   * Log at warn level (non-fatal issues, fallbacks used)
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  /**
   * Log at error level (failures, exceptions)
   */
  error(message: string, context?: Record<string, unknown>): void {
    this.log("error", message, context);
  }

  /**
   * Log with explicit level
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    const now = new Date();
    const elapsedMs = now.getTime() - this.startTimeMs;

    const entry: JobLogEntry = {
      timestamp: now,
      level,
      message,
      context,
      duration: elapsedMs,
    };

    this.entries.push(entry);

    // Also keep in ringbuffer for real-time streaming
    this.ringbuffer.push(entry);
    if (this.ringbuffer.length > this.maxRingbufferSize) {
      this.ringbuffer.shift();
    }

    // Always log to console as well
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    console.log(
      `[${level.toUpperCase()}] [job:${this.jobId}] ${message}${contextStr}`,
    );
  }

  /**
   * Get all collected logs
   */
  getAllLogs(): JobLogEntry[] {
    return [...this.entries];
  }

  /**
   * Get recent logs (ringbuffer)
   */
  getRecentLogs(count: number = 20): JobLogEntry[] {
    return this.ringbuffer.slice(-count);
  }

  /**
   * Persist logs to MongoDB jobLogs collection
   */
  async persist(): Promise<void> {
    const unpersisted = this.entries.slice(this.persistedCount);
    if (unpersisted.length === 0) {
      return;
    }

    try {
      const db = mongoose.connection.db;
      if (!db) {
        console.warn("Cannot persist logs: database not connected");
        return;
      }

      const jobLogsCollection = db.collection("jobLogs");
      const documents = unpersisted.map((entry) => ({
        jobId: new mongoose.Types.ObjectId(this.jobId),
        ...entry,
      }));

      await jobLogsCollection.insertMany(documents);
      this.persistedCount += unpersisted.length;
    } catch (error) {
      console.error(
        "Failed to persist job logs:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
