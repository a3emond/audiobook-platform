import dotenv from "dotenv";
import mongoose from "mongoose";

import { JobRunner } from "./queue/job.runner.js";

dotenv.config();

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required env var: ${name}`);
	}

	return value;
}

const mongoUri = requireEnv("MONGO_URI");

let runner: JobRunner | null = null;

async function startWorker(): Promise<void> {
	await mongoose.connect(mongoUri);
	console.info("Worker connected to MongoDB");

	runner = new JobRunner();
	await runner.start();

	console.info("Worker started");
}

async function shutdown(signal: string): Promise<void> {
	console.info("Worker shutdown requested", { signal });

	if (runner) {
		await runner.stop();
		runner = null;
	}

	await mongoose.connection.close();
	console.info("Worker disconnected from MongoDB");
}

process.on("SIGINT", () => {
	void shutdown("SIGINT").finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
	void shutdown("SIGTERM").finally(() => process.exit(0));
});

startWorker().catch((error) => {
	console.error("Worker failed to start", error);
	process.exit(1);
});
