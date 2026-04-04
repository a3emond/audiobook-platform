import mongoose, {
  Schema,
  type InferSchemaType,
  type HydratedDocument,
  type Model,
  Types,
} from "mongoose";

export const JUMP_VALUES = [5, 10, 15, 20, 25, 30] as const;
export const SORT_FIELDS = [
  "recent",
  "title",
  "author",
  "series",
  "progress",
] as const;
export const SORT_DIRECTIONS = ["asc", "desc"] as const;

const resumeRewindSchema = new Schema(
  {
    enabled: {
      type: Boolean,
      default: true,
    },
    thresholdSinceLastListenSeconds: {
      type: Number,
      min: 0,
      default: 86400,
    },
    rewindSeconds: {
      type: Number,
      enum: JUMP_VALUES,
      default: 30,
    },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const playerSettingsSchema = new Schema(
  {
    forwardJumpSeconds: {
      type: Number,
      enum: JUMP_VALUES,
      default: 30,
    },
    backwardJumpSeconds: {
      type: Number,
      enum: JUMP_VALUES,
      default: 10,
    },
    resumeRewind: {
      type: resumeRewindSchema,
      default: () => ({
        enabled: true,
        thresholdSinceLastListenSeconds: 86400,
        rewindSeconds: 30,
      }),
    },
    playbackRate: {
      type: Number,
      min: 0.5,
      max: 3,
      default: 1,
    },
    autoMarkCompletedThresholdSeconds: {
      type: Number,
      min: 0,
      default: 20,
    },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const librarySettingsSchema = new Schema(
  {
    sortBy: {
      type: String,
      enum: SORT_FIELDS,
      default: "series",
    },
    sortDirection: {
      type: String,
      enum: SORT_DIRECTIONS,
      default: "asc",
    },
    showCompleted: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const settingsSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    locale: {
      type: String,
      enum: ["fr", "en"],
      default: "fr",
    },
    player: {
      type: playerSettingsSchema,
      default: () => ({}),
    },
    library: {
      type: librarySettingsSchema,
      default: () => ({
        sortBy: "series",
        sortDirection: "asc",
        showCompleted: true,
      }),
    },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
    versionKey: false,
  },
);

export type UserSettings = InferSchemaType<typeof settingsSchema> & {
  userId: Types.ObjectId;
};
export type UserSettingsDocument = HydratedDocument<UserSettings>;
export type UserSettingsModelType = Model<UserSettings>;

export const SettingsModel =
  (mongoose.models.UserSettings as UserSettingsModelType | undefined) ||
  mongoose.model<UserSettings>("UserSettings", settingsSchema, "user_settings");
