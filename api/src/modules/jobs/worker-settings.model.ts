/**
 * Persistence model for background job queueing, worker coordination, and job observability.
 * Model files define how this feature is stored in MongoDB and usually carry
 * the schema, indexes, and document typing that other layers rely on as the
 * source of truth for persisted state.
 */
import mongoose, {
  Schema,
  type InferSchemaType,
  type HydratedDocument,
  type Model,
} from "mongoose";

import { JOB_TYPES, type JobType } from "./job.model.js";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const workerSettingsSchema = new Schema(
  {
    key: {
      type: String,
      default: "worker",
      unique: true,
      index: true,
    },
    queue: {
      heavyJobTypes: {
        type: [String],
        enum: JOB_TYPES,
        default: ["SANITIZE_MP3_TO_M4B", "REPLACE_FILE"],
      },
      heavyJobDelayMs: {
        type: Number,
        min: 0,
        default: 0,
      },
      heavyWindowEnabled: {
        type: Boolean,
        default: false,
      },
      heavyWindowStart: {
        type: String,
        default: "03:00",
        validate: {
          validator: (value: string) => timePattern.test(value),
          message: "worker_settings_invalid_start_time",
        },
      },
      heavyWindowEnd: {
        type: String,
        default: "05:00",
        validate: {
          validator: (value: string) => timePattern.test(value),
          message: "worker_settings_invalid_end_time",
        },
      },
      heavyConcurrency: {
        type: Number,
        min: 1,
        default: 1,
      },
      fastConcurrency: {
        type: Number,
        min: 0,
        default: 0,
      },
    },
    parity: {
      enabled: {
        type: Boolean,
        default: true,
      },
      intervalMs: {
        type: Number,
        min: 60_000,
        default: 3_600_000,
      },
    },
    taxonomy: {
      enabled: {
        type: Boolean,
        default: true,
      },
      intervalMs: {
        type: Number,
        min: 60_000,
        default: 3_600_000,
      },
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
    versionKey: false,
  },
);

export type WorkerSettings = InferSchemaType<typeof workerSettingsSchema> & {
  key: "worker";
  queue: {
    heavyJobTypes: JobType[];
    heavyJobDelayMs: number;
    heavyWindowEnabled: boolean;
    heavyWindowStart: string;
    heavyWindowEnd: string;
    heavyConcurrency: number;
    fastConcurrency: number;
  };
  parity: {
    enabled: boolean;
    intervalMs: number;
  };
  taxonomy: {
    enabled: boolean;
    intervalMs: number;
  };
};

export type WorkerSettingsDocument = HydratedDocument<WorkerSettings>;
export type WorkerSettingsModelType = Model<WorkerSettings>;

export const WorkerSettingsModel =
  (mongoose.models.WorkerSettings as WorkerSettingsModelType | undefined) ||
  mongoose.model<WorkerSettings>("WorkerSettings", workerSettingsSchema, "worker_settings");
