import mongoose, {
  Schema,
  type HydratedDocument,
  type InferSchemaType,
  type Model,
} from "mongoose";

const discussionMessageSchema = new Schema(
  {
    channelKey: {
      type: String,
      enum: ["general", "book-requests", "series-talk", "recommendations"],
      required: true,
      index: true,
    },
    lang: {
      type: String,
      enum: ["en", "fr"],
      required: true,
      index: true,
    },
    authorUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: "User",
    },
    body: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 2000,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

discussionMessageSchema.index({ lang: 1, channelKey: 1, createdAt: -1 });

export type DiscussionMessage = InferSchemaType<typeof discussionMessageSchema>;
export type DiscussionMessageDocument = HydratedDocument<DiscussionMessage>;
export type DiscussionMessageModel = Model<DiscussionMessage>;

export const DiscussionMessageModel =
  (mongoose.models.DiscussionMessage as DiscussionMessageModel | undefined) ||
  mongoose.model<DiscussionMessage>(
    "DiscussionMessage",
    discussionMessageSchema,
    "discussion_messages",
  );
