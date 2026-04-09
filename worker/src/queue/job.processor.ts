import { handleDeleteBookJob } from "../jobs/delete-book.job.js";
import { handleExtractCoverJob } from "../jobs/extract-cover.job.js";
import { handleIngestJob } from "../jobs/ingest.job.js";
import { handleIngestMp3AsM4BJob } from "../jobs/ingest-mp3-as-m4b.job.js";
import { handleSanitizeMp3Job } from "../jobs/sanitize-mp3.job.js";
import { handleReplaceFileJob } from "../jobs/replace-file.job.js";
import { handleReplaceCoverJob } from "../jobs/replace-cover.job.js";
import { handleRescanJob } from "../jobs/rescan.job.js";
import { handleWriteMetadataJob } from "../jobs/write-metadata.job.js";
import { WorkerSettingsService, isInWindow } from "../services/worker-settings.service.js";

import {
	JobModel,
	type JobDocument,
	type JobType,
	type SerializedJobError,
} from "./job.types.js";

type JobHandlerOutput = Record<string, unknown> | null | void;
type JobHandler = (job: JobDocument) => Promise<JobHandlerOutput>;

/**
 * 'any'  — can claim any job type; heavy types are skipped only when
 *           outside the configured time window (existing behaviour).
 * 'fast' — never claims heavy job types, regardless of the time window.
 *           Ensures these slots stay responsive for lightweight operations.
 */
export type SlotLane = 'any' | 'fast';

const handlers: Record<JobType, JobHandler> = {
	INGEST: handleIngestJob,
	INGEST_MP3_AS_M4B: handleIngestMp3AsM4BJob,
	SANITIZE_MP3_TO_M4B: handleSanitizeMp3Job,
	RESCAN: handleRescanJob,
	WRITE_METADATA: handleWriteMetadataJob,
	EXTRACT_COVER: handleExtractCoverJob,
	REPLACE_COVER: handleReplaceCoverJob,
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
	constructor(
		private readonly workerId: string,
		private readonly lane: SlotLane = 'any',
	) {}

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

			const output = await handler(job);

			await JobModel.updateOne(
				{ _id: job._id, lockedBy: this.workerId },
				{
					$set: {
						status: "done",
						output: output ?? null,
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
							output: null,
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
							output: null,
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

	async reclaimStaleLocks(): Promise<number> {
		const lockTimeoutMs = parseNumberEnv("WORKER_JOB_LOCK_TIMEOUT_MS", 10 * 60 * 1000);
		const staleThreshold = new Date(Date.now() - lockTimeoutMs);

		const result = await JobModel.updateMany(
			{
				status: "running",
				lockedAt: { $lt: staleThreshold },
			},
			{
				$set: {
					status: "queued",
					lockedBy: null,
					lockedAt: null,
					startedAt: null,
				},
			},
		);

		if (result.modifiedCount > 0) {
			console.warn("reclaimed stale job locks", {
				workerId: this.workerId,
				count: result.modifiedCount,
			});
		}

		return result.modifiedCount;
	}

	private async claimNextJob(): Promise<JobDocument | null> {
		const now = new Date();
		const queueSettings = await WorkerSettingsService.getQueueSettings();
		const heavyWindowOpen =
			!queueSettings.heavyWindowEnabled ||
			isInWindow(now, queueSettings.heavyWindowStart, queueSettings.heavyWindowEnd);

		const query: Record<string, unknown> = {
			status: { $in: ["queued", "retrying"] },
			runAfter: { $lte: now },
		};

		const hasHeavyTypes = queueSettings.heavyJobTypes.length > 0;

		if (this.lane === 'fast' && hasHeavyTypes) {
			// Fast slots permanently exclude heavy types — they must stay
			// available for quick operations at all times.
			query.type = { $nin: queueSettings.heavyJobTypes };
		} else if (this.lane === 'any' && !heavyWindowOpen && hasHeavyTypes) {
			// Any-lane slots respect the time window: skip heavy types
			// outside the allowed window.
			query.type = { $nin: queueSettings.heavyJobTypes };
		}

		return JobModel.findOneAndUpdate(
			query,
			{
				$set: {
					status: "running",
					startedAt: now,
					lockedBy: this.workerId,
					lockedAt: now,
				},
			},
			{
				sort: { priority: -1, runAfter: 1, createdAt: 1 },
				returnDocument: "after",
			},
		);
	}
}
