/**
 * Persistence model for listening analytics, session history, and usage reporting.
 * Model files define how this feature is stored in MongoDB and usually carry
 * the schema, indexes, and document typing that other layers rely on as the
 * source of truth for persisted state.
 */
import mongoose, {
  Schema,
  type InferSchemaType,
  type HydratedDocument,
  type Model,
  Types,
} from "mongoose";

const lifetimeStatsSchema = new Schema(
  {
    totalListeningSeconds: { type: Number, min: 0, default: 0 },
    completedBooksCount: { type: Number, min: 0, default: 0 },
    distinctBooksStarted: { type: Number, min: 0, default: 0 },
    distinctBooksCompleted: { type: Number, min: 0, default: 0 },
    totalSessions: { type: Number, min: 0, default: 0 },
    totalSeekCount: { type: Number, min: 0, default: 0 },
    totalForwardJumps: { type: Number, min: 0, default: 0 },
    totalBackwardJumps: { type: Number, min: 0, default: 0 },
    lastListeningAt: { type: Date, default: null },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const rollingStatsSchema = new Schema(
  {
    last7DaysListeningSeconds: { type: Number, min: 0, default: 0 },
    last30DaysListeningSeconds: { type: Number, min: 0, default: 0 },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const statsSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    lifetime: {
      type: lifetimeStatsSchema,
      default: () => ({}),
    },
    rolling: {
      type: rollingStatsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
    versionKey: false,
  },
);

export type UserStats = InferSchemaType<typeof statsSchema> & {
  userId: Types.ObjectId;
};
export type UserStatsDocument = HydratedDocument<UserStats>;
export type UserStatsModelType = Model<UserStats>;

export const StatsModel =
  (mongoose.models.UserStats as UserStatsModelType | undefined) ||
  mongoose.model<UserStats>("UserStats", statsSchema, "user_stats");
