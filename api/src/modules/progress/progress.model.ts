import mongoose, {
  Schema,
  type InferSchemaType,
  type HydratedDocument,
  type Model,
  Types,
} from "mongoose";

const progressSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    bookId: {
      type: Schema.Types.ObjectId,
      ref: "Book",
      required: true,
      index: true,
    },
    positionSeconds: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    durationAtSave: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    fileChecksumAtSave: {
      type: String,
      required: true,
      trim: true,
    },
    bookVersionAtSave: {
      type: Number,
      required: true,
      min: 1,
    },
    lastChapterIndex: {
      type: Number,
      min: 0,
      default: null,
    },
    secondsIntoChapter: {
      type: Number,
      min: 0,
      default: null,
    },
    completed: {
      type: Boolean,
      default: false,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    manualCompletion: {
      type: Boolean,
      default: false,
    },
    lastListenedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

progressSchema.index({ userId: 1, bookId: 1 }, { unique: true });
progressSchema.index({ userId: 1, updatedAt: -1 });
progressSchema.index({ userId: 1, completed: 1, updatedAt: -1 });

export interface ProgressMethods {
  markCompleted(manual?: boolean): void;
  markIncomplete(): void;
}

export type Progress = InferSchemaType<typeof progressSchema> & {
  userId: Types.ObjectId;
  bookId: Types.ObjectId;
};
export type ProgressDocument = HydratedDocument<Progress, ProgressMethods>;
export type ProgressModelType = Model<Progress, {}, ProgressMethods>;

progressSchema.method("markCompleted", function markCompleted(manual = false) {
  this.completed = true;
  this.completedAt = new Date();
  this.manualCompletion = manual;
});

progressSchema.method("markIncomplete", function markIncomplete() {
  this.completed = false;
  this.completedAt = null;
  this.manualCompletion = false;
});

export const ProgressModel =
  (mongoose.models.Progress as ProgressModelType | undefined) ||
  mongoose.model<Progress, ProgressModelType>(
    "Progress",
    progressSchema,
    "progress",
  );
