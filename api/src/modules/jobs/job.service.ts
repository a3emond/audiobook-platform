/**
 * Core business logic for background job queueing, worker coordination, and job observability.
 * In this codebase, services are the place where models, validation results,
 * worker/job coordination, and cross-feature rules come together so controllers
 * remain small and the domain behavior stays testable and reusable.
 */
import {
  JobModel,
  JOB_PRIORITY_DEFAULT,
  JOB_PRIORITY_MAX,
  JOB_PRIORITY_MIN,
  type JobType,
  type JobStatus,
  type JobDocument,
} from "./job.model.js";
import { WorkerSettingsService } from "./worker-settings.service.js";
import { JobLogModel } from "./job-log.model.js";
import type { JobDTO } from "../../dto/job.dto.js";
import { ApiError } from "../../utils/api-error.js";
import mongoose from "mongoose";

export class JobService {
  private static readonly DEFAULT_PRIORITY_BY_TYPE: Partial<Record<JobType, number>> = {
    INGEST: 80,
    INGEST_MP3_AS_M4B: 80,
    SANITIZE_MP3_TO_M4B: 20,
    REPLACE_FILE: 20,
    SYNC_TAGS: 25,
    WRITE_METADATA: 35,
  };

  private static parseNumberEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) {
      return fallback;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private static clampPriority(priority: number): number {
    return Math.max(JOB_PRIORITY_MIN, Math.min(JOB_PRIORITY_MAX, Math.round(priority)));
  }

  private static async computeDefaultRunAfter(type: JobType): Promise<Date> {
    const settings = await WorkerSettingsService.getSettings();
    const isHeavyType = settings.queue.heavyJobTypes.includes(type);
    if (!isHeavyType) {
      return new Date();
    }

    const delayMs = Math.max(
      0,
      settings.queue.heavyJobDelayMs ?? this.parseNumberEnv("HEAVY_JOB_DELAY_MS", 0),
    );
    return new Date(Date.now() + delayMs);
  }

  /**
   * Enqueue a new job
   */
  static async enqueueJob(
    type: JobType,
    payload: unknown,
    options: number | { maxAttempts?: number; priority?: number; runAfter?: Date } = 3,
  ): Promise<JobDTO> {
    const normalized =
      typeof options === "number"
        ? { maxAttempts: options }
        : {
            maxAttempts: options.maxAttempts ?? 3,
            priority: options.priority,
            runAfter: options.runAfter,
          };

    const maxAttempts = normalized.maxAttempts ?? 3;
    if (maxAttempts < 1) {
      throw new ApiError(400, "job_invalid_max_attempts");
    }

    const defaultPriority = this.DEFAULT_PRIORITY_BY_TYPE[type] ?? JOB_PRIORITY_DEFAULT;
    const priority = this.clampPriority(normalized.priority ?? defaultPriority);
    const runAfter = normalized.runAfter ?? (await this.computeDefaultRunAfter(type));

    const job = await JobModel.create({
      type,
      payload,
      output: null,
      maxAttempts,
      priority,
      status: "queued",
      attempt: 0,
      runAfter,
      error: null,
    });

    return this.formatJobDTO(job);
  }

  /**
   * Get job by ID
   */
  static async getJobById(jobId: string): Promise<JobDTO> {
    const job = await JobModel.findById(jobId);

    if (!job) {
      throw new ApiError(404, "job_not_found");
    }

    return this.formatJobDTO(job);
  }

  /**
   * List jobs with filtering and pagination
   */
  static async listJobs(
    filters: {
      status?: JobStatus;
      type?: JobType;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ jobs: JobDTO[]; total: number; limit: number; offset: number; hasMore: boolean }> {
    const { status, type, limit = 20, offset = 0 } = filters;

    // Build query
    const query: Record<string, unknown> = {};
    if (status) query.status = status;
    if (type) query.type = type;

    // Fetch jobs
    const jobs = await JobModel.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset);

    const total = await JobModel.countDocuments(query);

    return {
      jobs: jobs.map((job) => this.formatJobDTO(job)),
      total,
      limit,
      offset,
      hasMore: offset + jobs.length < total,
    };
  }

  static async listJobsUpdatedSince(since: Date, limit = 100): Promise<JobDTO[]> {
    const jobs = await JobModel.find({ updatedAt: { $gt: since } })
      .sort({ updatedAt: 1 })
      .limit(limit);

    return jobs.map((job) => this.formatJobDTO(job));
  }

  /**
   * Get job statistics
   */
  static async getJobStats(): Promise<{
    queued: number;
    running: number;
    retrying: number;
    done: number;
    failed: number;
    total: number;
  }> {
    const statuses: JobStatus[] = [
      "queued",
      "running",
      "retrying",
      "done",
      "failed",
    ];
    const stats = { queued: 0, running: 0, retrying: 0, done: 0, failed: 0, total: 0 };

    for (const status of statuses) {
      const count = await JobModel.countDocuments({ status });
      stats[status as keyof typeof stats] = count;
      stats.total += count;
    }

    return stats;
  }

  /**
   * Cancel a queued job (if not started)
   */
  static async cancelJob(jobId: string): Promise<JobDTO> {
    const job = await JobModel.findById(jobId);

    if (!job) {
      throw new ApiError(404, "job_not_found");
    }

    // Can only cancel queued jobs
    if (job.status !== "queued") {
      throw new ApiError(400, "job_cannot_cancel_non_queued");
    }

    job.status = "failed";
    job.output = null;
    job.error = { code: "job_cancelled_by_user", timestamp: new Date() };
    job.finishedAt = new Date();

    await job.save();

    return this.formatJobDTO(job);
  }

  /**
   * Get logs for a specific job
   */
  static async getJobLogs(
    jobId: string,
    filters: {
      limit?: number;
      offset?: number;
      level?: "debug" | "info" | "warn" | "error";
    } = {},
  ): Promise<{
    jobId: string;
    logs: Array<{
      timestamp: string;
      level: string;
      message: string;
      context?: unknown;
      duration?: number;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    // Verify job exists
    const job = await JobModel.findById(jobId);
    if (!job) {
      throw new ApiError(404, "job_not_found");
    }

    const { limit = 100, offset = 0, level } = filters;
    const objId = new mongoose.Types.ObjectId(jobId);

    const query: Record<string, unknown> = { jobId: objId };
    if (level) {
      query.level = level;
    }

    const logs = await JobLogModel.find(query)
      .sort({ timestamp: 1 })
      .limit(limit)
      .skip(offset);

    const total = await JobLogModel.countDocuments(query);

    return {
      jobId,
      logs: logs.map((log) => ({
        timestamp: log.timestamp.toISOString(),
        level: log.level,
        message: log.message,
        context: log.context,
        duration: log.duration,
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Search logs across all jobs
   */
  static async searchLogs(
    filters: {
      jobType?: string;
      level?: "debug" | "info" | "warn" | "error";
      search?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{
    logs: Array<{
      jobId: string;
      jobType: string;
      timestamp: string;
      level: string;
      message: string;
      context?: unknown;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const { jobType, level, search, limit = 50, offset = 0 } = filters;

    // First, get matching job IDs if jobType is specified
    let jobIds: mongoose.Types.ObjectId[] | undefined;
    if (jobType) {
      const jobs = await JobModel.find({ type: jobType }).select("_id");
      jobIds = jobs.map((j) => j._id);
    }

    // Build log query
    const logQuery: Record<string, unknown> = {};
    if (jobIds) {
      logQuery.jobId = { $in: jobIds };
    }
    if (level) {
      logQuery.level = level;
    }
    if (search) {
      logQuery.$text = { $search: search }; // Requires text index on message
    }

    const logs = await JobLogModel.find(logQuery)
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(offset)
      .lean();

    const total = await JobLogModel.countDocuments(logQuery);

    // Enrich logs with job type information
    const jobTypeLookup = new Map<string, string>();
    for (const log of logs) {
      const jobIdStr = log.jobId.toString();
      if (!jobTypeLookup.has(jobIdStr)) {
        const job = await JobModel.findById(log.jobId).select("type");
        if (job) {
          jobTypeLookup.set(jobIdStr, job.type);
        }
      }
    }

    return {
      logs: logs.map((log) => ({
        jobId: log.jobId.toString(),
        jobType: jobTypeLookup.get(log.jobId.toString()) || "unknown",
        timestamp: log.timestamp.toISOString(),
        level: log.level,
        message: log.message,
        context: log.context,
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Format job document as DTO
   */
  private static formatJobDTO(job: JobDocument): JobDTO {
    return {
      id: job._id.toString(),
      type: job.type,
      status: job.status,
      payload: job.payload,
      output: job.output,
      error: job.error,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      priority: job.priority ?? JOB_PRIORITY_DEFAULT,
      runAfter: job.runAfter?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt?.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
    };
  }
}
