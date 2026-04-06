import type { JobDocument } from "../queue/job.types.js";

export async function handleWriteMetadataJob(job: JobDocument): Promise<void> {
	console.warn("WRITE_METADATA job received but handler is not implemented", {
		jobId: String(job._id),
	});

	throw new Error("job_not_implemented:WRITE_METADATA");
}
