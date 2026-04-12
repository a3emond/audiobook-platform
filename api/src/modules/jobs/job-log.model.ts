/**
 * Persistence model for background job queueing, worker coordination, and job observability.
 * Model files define how this feature is stored in MongoDB and usually carry
 * the schema, indexes, and document typing that other layers rely on as the
 * source of truth for persisted state.
 */
import mongoose, { Schema, Document } from "mongoose";

const retentionDays = Math.max(
  1,
  parseInt(process.env.JOB_LOG_RETENTION_DAYS ?? "15", 10) || 15,
);
const JOB_LOG_TTL_SECONDS = retentionDays * 24 * 60 * 60;

export interface IJobLog extends Document {
  jobId: mongoose.Types.ObjectId;
  timestamp: Date;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  context?: Record<string, unknown>;
  duration?: number;
  createdAt: Date;
}

const JobLogSchema = new Schema<IJobLog>(
  {
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    level: {
      type: String,
      enum: ["debug", "info", "warn", "error"],
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    context: {
      type: Schema.Types.Mixed,
      sparse: true,
    },
    duration: {
      type: Number, // milliseconds since job start
      sparse: true,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
    collection: "jobLogs",
  },
);

// Compound indexes for efficient queries
JobLogSchema.index({ jobId: 1, timestamp: 1 });
JobLogSchema.index({ level: 1, createdAt: -1 });

// TTL index: auto-delete logs after JOB_LOG_RETENTION_DAYS (default 15)
JobLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: JOB_LOG_TTL_SECONDS });

export const JobLogModel = mongoose.model<IJobLog>("JobLog", JobLogSchema);
