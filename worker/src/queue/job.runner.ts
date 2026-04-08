import os from "os";

import { JobProcessor } from "./job.processor.js";

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
	private readonly concurrency: number;
	private readonly workerId: string;
	private runningTasks: Promise<void>[] = [];
	private stopping = false;

	constructor() {
		this.pollMs = Math.max(100, parseNumberEnv("WORKER_POLL_MS", 1500));
		this.concurrency = Math.max(1, parseNumberEnv("WORKER_CONCURRENCY", 1));
		this.workerId = process.env.WORKER_ID || `${os.hostname()}-${process.pid}`;
	}

	async start(): Promise<void> {
		console.info("job runner starting", {
			workerId: this.workerId,
			pollMs: this.pollMs,
			concurrency: this.concurrency,
		});

		this.runningTasks = Array.from({ length: this.concurrency }, (_, index) =>
			this.runLoop(index),
		);
	}

	async stop(): Promise<void> {
		this.stopping = true;
		await Promise.all(this.runningTasks);
		this.runningTasks = [];

		console.info("job runner stopped", { workerId: this.workerId });
	}

	private async runLoop(slot: number): Promise<void> {
		const processor = new JobProcessor(`${this.workerId}/slot-${slot + 1}`);
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
					error: error instanceof Error ? error.message : String(error),
				});

				await sleep(this.pollMs);
			}
		}
	}
}
