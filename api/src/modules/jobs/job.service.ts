import { JobModel, type JobType, type JobStatus, type JobDocument } from "./job.model.js";
import type { JobDTO } from "../../dto/job.dto.js";
import { ApiError } from "../../utils/api-error.js";

export class JobService {
  /**
   * Enqueue a new job
   */
  static async enqueueJob(
    type: JobType,
    payload: unknown,
    maxAttempts: number = 3,
  ): Promise<JobDTO> {
    if (maxAttempts < 1) {
      throw new ApiError(400, "job_invalid_max_attempts");
    }

    const job = await JobModel.create({
      type,
      payload,
      output: null,
      maxAttempts,
      status: "queued",
      attempt: 0,
      runAfter: new Date(),
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
  ): Promise<{ jobs: JobDTO[]; total: number }> {
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
    };
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
      runAfter: job.runAfter?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt?.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
    };
  }
}
