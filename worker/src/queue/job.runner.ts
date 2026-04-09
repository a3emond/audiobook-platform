import os from "os";

import { WorkerSettingsService } from "../services/worker-settings.service.js";
import { JobProcessor, type SlotLane } from "./job.processor.js";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function parseNumberEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) {
		return fallback;
	}

	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export class JobRunner {
	private readonly pollMs: number;
	/** Env-var fallback values — overridden by DB settings in start() */
	private readonly defaultHeavyConcurrency: number;
	private readonly defaultFastConcurrency: number;
	private readonly workerId: string;
	private runningTasks: Promise<void>[] = [];
	private stopping = false;

	constructor() {
		this.pollMs = Math.max(100, parseNumberEnv("WORKER_POLL_MS", 1500));

		const legacyConcurrency = parseNumberEnv("WORKER_CONCURRENCY", 0);
		this.defaultHeavyConcurrency = Math.max(
			1,
			parseNumberEnv("WORKER_CONCURRENCY_HEAVY", legacyConcurrency > 0 ? legacyConcurrency : 1),
		);
		this.defaultFastConcurrency = Math.max(
			0,
			parseNumberEnv("WORKER_CONCURRENCY_FAST", 0),
		);

		this.workerId = process.env.WORKER_ID || `${os.hostname()}-${process.pid}`;
	}

	async start(): Promise<void> {
		// DB settings take priority; env vars are the fallback when no record exists yet.
		const dbSettings = await WorkerSettingsService.getQueueSettings();
		const heavyConcurrency = dbSettings.heavyConcurrency ?? this.defaultHeavyConcurrency;
		const fastConcurrency = dbSettings.fastConcurrency ?? this.defaultFastConcurrency;

		const totalConcurrency = heavyConcurrency + fastConcurrency;
		console.info("job runner starting", {
			workerId: this.workerId,
			pollMs: this.pollMs,
			heavyConcurrency,
			fastConcurrency,
			totalConcurrency,
		});

		const heavyTasks = Array.from({ length: heavyConcurrency }, (_, i) =>
			this.runLoop(i, "any"),
		);

		const fastTasks = Array.from({ length: fastConcurrency }, (_, i) =>
			this.runLoop(heavyConcurrency + i, "fast"),
		);

		this.runningTasks = [...heavyTasks, ...fastTasks];
	}

	async stop(): Promise<void> {
		this.stopping = true;
		await Promise.all(this.runningTasks);
		this.runningTasks = [];

		console.info("job runner stopped", { workerId: this.workerId });
	}

	private async runLoop(slot: number, lane: SlotLane): Promise<void> {
		const processor = new JobProcessor(`${this.workerId}/slot-${slot + 1}`, lane);
		const reclaimIntervalMs = Math.max(
			60_000,
			parseNumberEnv("WORKER_LOCK_RECLAIM_INTERVAL_MS", 5 * 60 * 1000),
		);
		let lastReclaimAt = 0;

		while (!this.stopping) {
			try {
				// Only slot 0 handles stale lock reclaim to avoid concurrent updates
				if (slot === 0 && Date.now() - lastReclaimAt >= reclaimIntervalMs) {
					await processor.reclaimStaleLocks();
					lastReclaimAt = Date.now();
				}

				const processed = await processor.processNext();
				if (!processed) {
					await sleep(this.pollMs);
				}
			} catch (error) {
				console.error("worker loop error", {
					slot,
					lane,
					error: error instanceof Error ? error.message : String(error),
				});

				await sleep(this.pollMs);
			}
		}
	}
}

