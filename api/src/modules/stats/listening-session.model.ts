import mongoose, {
  Schema,
  type InferSchemaType,
  type HydratedDocument,
  type Model,
  Types,
} from "mongoose";

export const SESSION_DEVICES = [
  "web",
  "ios",
  "android",
  "desktop",
  "unknown",
] as const;

const listeningSessionSchema = new Schema(
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
    startedAt: {
      type: Date,
      required: true,
      index: true,
    },
    endedAt: {
      type: Date,
      required: true,
    },
    listenedSeconds: {
      type: Number,
      required: true,
      min: 0,
    },
    startPositionSeconds: {
      type: Number,
      required: true,
      min: 0,
    },
    endPositionSeconds: {
      type: Number,
      required: true,
      min: 0,
    },
    fileChecksum: {
      type: String,
      required: true,
      trim: true,
    },
    bookVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    device: {
      type: String,
      enum: SESSION_DEVICES,
      default: "web",
      index: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

listeningSessionSchema.index({ userId: 1, startedAt: -1 });
listeningSessionSchema.index({ userId: 1, bookId: 1, startedAt: -1 });

export type ListeningSession = InferSchemaType<
  typeof listeningSessionSchema
> & {
  userId: Types.ObjectId;
  bookId: Types.ObjectId;
};
export type ListeningSessionDocument = HydratedDocument<ListeningSession>;
export type ListeningSessionModelType = Model<ListeningSession>;

export const ListeningSessionModel =
  (mongoose.models.ListeningSession as ListeningSessionModelType | undefined) ||
  mongoose.model<ListeningSession>(
    "ListeningSession",
    listeningSessionSchema,
    "listening_sessions",
  );
