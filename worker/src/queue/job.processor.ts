import { handleDeleteBookJob } from "../jobs/delete-book.job.js";
import { handleExtractCoverJob } from "../jobs/extract-cover.job.js";
import { handleIngestJob } from "../jobs/ingest.job.js";
import { handleReplaceFileJob } from "../jobs/replace-file.job.js";
import { handleRescanJob } from "../jobs/rescan.job.js";
import { handleWriteMetadataJob } from "../jobs/write-metadata.job.js";

import {
	JobModel,
	type JobDocument,
	type JobType,
	type SerializedJobError,
} from "./job.types.js";

type JobHandler = (job: JobDocument) => Promise<void>;

const handlers: Record<JobType, JobHandler> = {
	INGEST: handleIngestJob,
	RESCAN: handleRescanJob,
	WRITE_METADATA: handleWriteMetadataJob,
	EXTRACT_COVER: handleExtractCoverJob,
	DELETE_BOOK: handleDeleteBookJob,
	REPLACE_FILE: handleReplaceFileJob,
};

function parseNumberEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) {
		return fallback;
	}

	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function serializeError(error: unknown): SerializedJobError {
	if (error instanceof Error) {
		return {
			code: error.name || "Error",
			message: error.message,
			stack: error.stack,
			at: new Date().toISOString(),
		};
	}

	return {
		code: "UnknownError",
		message: String(error),
		at: new Date().toISOString(),
	};
}

function computeRetryDelayMs(attempt: number): number {
	const baseMs = Math.max(250, parseNumberEnv("WORKER_RETRY_BASE_MS", 2000));
	const maxMs = Math.max(baseMs, parseNumberEnv("WORKER_RETRY_MAX_MS", 60000));

	const exponentialDelay = baseMs * Math.pow(2, Math.max(0, attempt - 1));
	const jitter = Math.floor(Math.random() * 250);

	return Math.min(maxMs, exponentialDelay + jitter);
}

export class JobProcessor {
	constructor(private readonly workerId: string) {}

	async processNext(): Promise<boolean> {
		const job = await this.claimNextJob();
		if (!job) {
			return false;
		}

		const handler = handlers[job.type];
		const jobId = String(job._id);

		try {
			if (!handler) {
				throw new Error(`unknown_job_type:${job.type}`);
			}

			await handler(job);

			await JobModel.updateOne(
				{ _id: job._id, lockedBy: this.workerId },
				{
					$set: {
						status: "done",
						error: null,
						finishedAt: new Date(),
						lockedBy: null,
						lockedAt: null,
					},
				},
			);

			console.info("job completed", { workerId: this.workerId, jobId, type: job.type });
		} catch (error) {
			const attempt = (job.attempt ?? 0) + 1;
			const maxAttempts = Math.max(1, job.maxAttempts ?? 3);
			const serialized = serializeError(error);

			if (attempt < maxAttempts) {
				const delayMs = computeRetryDelayMs(attempt);

				await JobModel.updateOne(
					{ _id: job._id, lockedBy: this.workerId },
					{
						$set: {
							status: "retrying",
							attempt,
							error: serialized,
							runAfter: new Date(Date.now() + delayMs),
							lockedBy: null,
							lockedAt: null,
						},
					},
				);

				console.warn("job failed and scheduled for retry", {
					workerId: this.workerId,
					jobId,
					type: job.type,
					attempt,
					maxAttempts,
					delayMs,
					error: serialized.message,
				});
			} else {
				await JobModel.updateOne(
					{ _id: job._id, lockedBy: this.workerId },
					{
						$set: {
							status: "failed",
							attempt,
							error: serialized,
							finishedAt: new Date(),
							lockedBy: null,
							lockedAt: null,
						},
					},
				);

				console.error("job failed permanently", {
					workerId: this.workerId,
					jobId,
					type: job.type,
					attempt,
					maxAttempts,
					error: serialized.message,
				});
			}
		}

		return true;
	}

	private async claimNextJob(): Promise<JobDocument | null> {
		const now = new Date();

		return JobModel.findOneAndUpdate(
			{
				status: { $in: ["queued", "retrying"] },
				runAfter: { $lte: now },
			},
			{
				$set: {
					status: "running",
					startedAt: now,
					lockedBy: this.workerId,
					lockedAt: now,
				},
			},
			{
				sort: { createdAt: 1 },
				new: true,
			},
		);
	}
}
