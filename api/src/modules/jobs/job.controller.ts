import { Request, Response } from "express";
import { JobService } from "./job.service.js";
import type { JobType, JobStatus } from "./job.model.js";
import { ApiError } from "../../utils/api-error.js";

export class JobController {
  /**
   * POST /api/jobs/enqueue
   * Enqueue a new job
   */
  static async enqueueJob(
    req: Request<
      unknown,
      unknown,
      {
        type: string;
        payload: unknown;
        maxAttempts?: number;
      }
    >,
    res: Response,
  ) {
    const { type, payload, maxAttempts } = req.body;

    // Validate type
    const validTypes = [
      "INGEST",
      "RESCAN",
      "WRITE_METADATA",
      "EXTRACT_COVER",
      "DELETE_BOOK",
      "REPLACE_FILE",
    ];

    if (!validTypes.includes(type)) {
      throw new ApiError(400, "job_invalid_type");
    }

    if (!payload || typeof payload !== "object") {
      throw new ApiError(400, "job_invalid_payload");
    }

    const result = await JobService.enqueueJob(
      type as JobType,
      payload,
      maxAttempts,
    );

    res.status(201).json(result);
  }

  /**
   * GET /api/jobs/:jobId
   * Get job status and details
   */
  static async getJob(
    req: Request<{ jobId?: string }>,
    res: Response,
  ) {
    const { jobId } = req.params;

    if (!jobId) {
      throw new ApiError(400, "job_id_required");
    }

    const job = await JobService.getJobById(jobId);

    res.status(200).json(job);
  }

  /**
   * GET /api/jobs
   * List jobs with filtering
   */
  static async listJobs(
    req: Request<
      unknown,
      unknown,
      unknown,
      {
        status?: string;
        type?: string;
        limit?: string;
        offset?: string;
      }
    >,
    res: Response,
  ) {
    const { status, type, limit, offset } = req.query;

    const filters: {
      status?: JobStatus;
      type?: JobType;
      limit?: number;
      offset?: number;
    } = {};

    if (status) {
      const validStatuses = ["queued", "running", "retrying", "done", "failed"];
      if (!validStatuses.includes(status)) {
        throw new ApiError(400, "job_invalid_status_filter");
      }
      filters.status = status as JobStatus;
    }

    if (type) {
      const validTypes = [
        "INGEST",
        "RESCAN",
        "WRITE_METADATA",
        "EXTRACT_COVER",
        "DELETE_BOOK",
        "REPLACE_FILE",
      ];
      if (!validTypes.includes(type)) {
        throw new ApiError(400, "job_invalid_type_filter");
      }
      filters.type = type as JobType;
    }

    if (limit) {
      const parsed = parseInt(limit, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 100) {
        throw new ApiError(400, "job_invalid_limit");
      }
      filters.limit = parsed;
    }

    if (offset) {
      const parsed = parseInt(offset, 10);
      if (isNaN(parsed) || parsed < 0) {
        throw new ApiError(400, "job_invalid_offset");
      }
      filters.offset = parsed;
    }

    const result = await JobService.listJobs(filters);

    res.status(200).json(result);
  }

  /**
   * GET /api/jobs/stats
   * Get job queue statistics
   */
  static async getStats(
    _req: Request,
    res: Response,
  ) {
    const stats = await JobService.getJobStats();

    res.status(200).json(stats);
  }

  /**
   * DELETE /api/jobs/:jobId
   * Cancel a queued job
   */
  static async cancelJob(
    req: Request<{ jobId?: string }>,
    res: Response,
  ) {
    const { jobId } = req.params;

    if (!jobId) {
      throw new ApiError(400, "job_id_required");
    }

    const result = await JobService.cancelJob(jobId);

    res.status(200).json(result);
  }
}
