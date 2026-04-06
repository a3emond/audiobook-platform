import type { JobDocument } from "../queue/job.types.js";

export async function handleDeleteBookJob(job: JobDocument): Promise<void> {
	console.warn("DELETE_BOOK job received but handler is not implemented", {
		jobId: String(job._id),
	});

	throw new Error("job_not_implemented:DELETE_BOOK");
}
