import type { JobDocument } from "../queue/job.types.js";

export async function handleReplaceFileJob(job: JobDocument): Promise<void> {
	console.warn("REPLACE_FILE job received but handler is not implemented", {
		jobId: String(job._id),
	});

	throw new Error("job_not_implemented:REPLACE_FILE");
}
