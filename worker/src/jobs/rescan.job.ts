import type { JobDocument } from "../queue/job.types.js";

export async function handleRescanJob(job: JobDocument): Promise<void> {
	console.warn("RESCAN job received but handler is not implemented", {
		jobId: String(job._id),
	});

	throw new Error("job_not_implemented:RESCAN");
}
