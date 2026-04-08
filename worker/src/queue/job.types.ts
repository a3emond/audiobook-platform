import mongoose, {
	Schema,
	type InferSchemaType,
	type HydratedDocument,
	type Model,
} from "mongoose";

export const JOB_TYPES = [
	"INGEST",
	"INGEST_MP3_AS_M4B",
	"RESCAN",
	"WRITE_METADATA",
	"EXTRACT_COVER",
	"REPLACE_COVER",
	"DELETE_BOOK",
	"REPLACE_FILE",
] as const;

export const JOB_STATUSES = [
	"queued",
	"running",
	"retrying",
	"done",
	"failed",
] as const;

export type JobType = (typeof JOB_TYPES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface SerializedJobError {
	code: string;
	message: string;
	stack?: string;
	at: string;
}

const jobSchema = new Schema(
	{
		type: {
			type: String,
			enum: JOB_TYPES,
			required: true,
			index: true,
		},
		status: {
			type: String,
			enum: JOB_STATUSES,
			default: "queued",
			index: true,
		},
		payload: {
			type: Schema.Types.Mixed,
			default: {},
		},
		output: {
			type: Schema.Types.Mixed,
			default: null,
		},
		error: {
			type: Schema.Types.Mixed,
			default: null,
		},
		attempt: {
			type: Number,
			default: 0,
			min: 0,
		},
		maxAttempts: {
			type: Number,
			default: 3,
			min: 1,
		},
		runAfter: {
			type: Date,
			default: Date.now,
			index: true,
		},
		startedAt: {
			type: Date,
			default: null,
			index: true,
		},
		finishedAt: {
			type: Date,
			default: null,
			index: true,
		},
		lockedBy: {
			type: String,
			default: null,
			index: true,
		},
		lockedAt: {
			type: Date,
			default: null,
			index: true,
		},
	},
	{
		timestamps: { createdAt: true, updatedAt: true },
		versionKey: false,
	},
);

jobSchema.index({ status: 1, runAfter: 1, createdAt: 1 });
jobSchema.index({ type: 1, createdAt: -1 });

export type Job = InferSchemaType<typeof jobSchema>;
export type JobDocument = HydratedDocument<Job>;
export type JobModelType = Model<Job>;

export const JobModel =
	(mongoose.models.Job as JobModelType | undefined) ||
	mongoose.model<Job>("Job", jobSchema, "jobs");
