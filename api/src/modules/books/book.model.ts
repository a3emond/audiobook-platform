import mongoose, {
  Schema,
  type InferSchemaType,
  type HydratedDocument,
  type Model,
} from "mongoose";

import { normalizeOptionalText } from "../../utils/normalize.js";

export const FILE_SYNC_STATUSES = [
  "in_sync",
  "dirty",
  "writing",
  "error",
] as const;
export type FileSyncStatus = (typeof FILE_SYNC_STATUSES)[number];

export const PROCESSING_STATES = [
  "ready",
  "pending_sanitize",
  "sanitizing",
  "sanitize_failed",
] as const;
export type ProcessingState = (typeof PROCESSING_STATES)[number];

const localizedTextSchema = new Schema(
  {
    default: { type: String, trim: true, default: null },
    fr: { type: String, trim: true, default: null },
    en: { type: String, trim: true, default: null },
  },
  {
    _id: false,
    versionKey: false,
  },
);

interface Chapter {
  start: number;
  end: number;
}

const chapterSchema = new Schema(
  {
    index: {
      type: Number,
      required: true,
      min: 0,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    start: {
      type: Number,
      required: true,
      min: 0,
    },
    end: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator(this: Chapter, value: number) {
          return value >= this.start;
        },
        message: "Chapter end must be greater than or equal to chapter start.",
      },
    },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const overridesSchema = new Schema(
  {
    title: { type: Boolean, default: false },
    author: { type: Boolean, default: false },
    series: { type: Boolean, default: false },
    seriesIndex: { type: Boolean, default: false },
    chapters: { type: Boolean, default: false },
    cover: { type: Boolean, default: false },
    description: { type: Boolean, default: false },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const fileSyncSchema = new Schema(
  {
    status: {
      type: String,
      enum: FILE_SYNC_STATUSES,
      default: "in_sync",
      index: true,
    },
    lastReadAt: {
      type: Date,
      default: null,
    },
    lastWriteAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const bookSchema = new Schema(
  {
    filePath: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    checksum: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    author: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    series: {
      type: String,
      trim: true,
      default: null,
      set: (value: unknown) => normalizeOptionalText(value),
      index: true,
    },
    seriesIndex: {
      type: Number,
      min: 0,
      default: null,
      index: true,
    },
    duration: {
      type: Number,
      required: true,
      min: 0,
    },
    language: {
      type: String,
      enum: ["en", "fr"],
      trim: true,
      required: true,
      default: "en",
      index: true,
    },
    chapters: {
      type: [chapterSchema],
      default: [],
    },
    coverPath: {
      type: String,
      trim: true,
      default: null,
    },
    tags: {
      type: [String],
      default: [],
      set: (values: string[]) =>
        Array.from(
          new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
        ),
      index: true,
    },
    genre: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    description: {
      type: localizedTextSchema,
      default: () => ({}),
    },
    overrides: {
      type: overridesSchema,
      default: () => ({}),
    },
    fileSync: {
      type: fileSyncSchema,
      default: () => ({ status: "in_sync" }),
    },
    version: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    lastScannedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    processingState: {
      type: String,
      enum: PROCESSING_STATES,
      default: "ready",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

bookSchema.index({
  title: "text",
  author: "text",
  series: "text",
  genre: "text",
  tags: "text",
});
bookSchema.index({ series: 1, seriesIndex: 1, title: 1 });
bookSchema.index({ createdAt: -1 });
bookSchema.index({ updatedAt: -1 });

export type Book = InferSchemaType<typeof bookSchema>;
export type BookDocument = HydratedDocument<Book>;
export type BookModelType = Model<Book>;

export const BookModel =
  (mongoose.models.Book as BookModelType | undefined) ||
  mongoose.model<Book>("Book", bookSchema, "books");
