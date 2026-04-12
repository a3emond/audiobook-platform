/**
 * Persistence model for community discussion channels and threaded messages.
 * Model files define how this feature is stored in MongoDB and usually carry
 * the schema, indexes, and document typing that other layers rely on as the
 * source of truth for persisted state.
 */
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
    replyToMessageId: {
      type: Schema.Types.ObjectId,
      required: false,
      index: true,
      ref: "DiscussionMessage",
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
