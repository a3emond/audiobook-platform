import { JobModel } from "../queue/job.types.js";
import { WorkerSettingsService } from "./worker-settings.service.js";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export class ParitySchedulerService {
	private stopping = false;
	private loopPromise: Promise<void> | null = null;

	start(): void {
		if (this.loopPromise) {
			return;
		}

		this.stopping = false;
		this.loopPromise = this.runLoop();
	}

	async stop(): Promise<void> {
		this.stopping = true;
		if (this.loopPromise) {
			await this.loopPromise;
			this.loopPromise = null;
		}
	}

	private async runLoop(): Promise<void> {
		let nextAttemptAt = 0;

		while (!this.stopping) {
			try {
				const settings = await WorkerSettingsService.getParitySettings();
				if (!settings.enabled) {
					nextAttemptAt = 0;
					await sleep(5_000);
					continue;
				}

				const intervalMs = Math.max(60_000, settings.intervalMs);
				const now = Date.now();

				if (now < nextAttemptAt) {
					await sleep(Math.min(5_000, nextAttemptAt - now));
					continue;
				}

				await this.ensureParityRescanQueued(intervalMs);
				nextAttemptAt = Date.now() + intervalMs;
			} catch (error) {
				console.error("parity scheduler error", {
					error: error instanceof Error ? error.message : String(error),
				});
				await sleep(5_000);
			}
		}
	}

	private async ensureParityRescanQueued(intervalMs: number): Promise<void> {
		const active = await JobModel.findOne({
			type: "RESCAN",
			status: { $in: ["queued", "running", "retrying"] },
			"payload.trigger": "parity-scheduler",
		}).sort({ createdAt: -1 });

		if (active) {
			console.info("parity rescan skipped; active parity job already exists", {
				jobId: String(active._id),
			});
			return;
		}

		const recentThreshold = new Date(Date.now() - intervalMs);
		const recent = await JobModel.findOne({
			type: "RESCAN",
			"payload.trigger": "parity-scheduler",
			createdAt: { $gte: recentThreshold },
		}).sort({ createdAt: -1 });

		if (recent) {
			return;
		}

		const created = await JobModel.create({
			type: "RESCAN",
			status: "queued",
			payload: {
				force: true,
				trigger: "parity-scheduler",
			},
			output: null,
			error: null,
			attempt: 0,
			maxAttempts: 3,
			priority: 30,
			runAfter: new Date(),
		});

		console.info("parity rescan queued", {
			jobId: String(created._id),
			intervalMs,
		});
	}
}