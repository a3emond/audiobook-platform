import type { JobDocument } from "../queue/job.types.js";

export async function handleExtractCoverJob(job: JobDocument): Promise<void> {
	console.warn("EXTRACT_COVER job received but handler is not implemented", {
		jobId: String(job._id),
	});

	throw new Error("job_not_implemented:EXTRACT_COVER");
}
