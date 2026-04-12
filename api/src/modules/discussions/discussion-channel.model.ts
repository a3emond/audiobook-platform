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

const discussionChannelSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 48,
      index: true,
    },
    lang: {
      type: String,
      enum: ["en", "fr"],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 220,
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

discussionChannelSchema.index({ lang: 1, key: 1 }, { unique: true });
discussionChannelSchema.index({ lang: 1, isActive: 1, title: 1 });

export type DiscussionChannel = InferSchemaType<typeof discussionChannelSchema>;
export type DiscussionChannelDocument = HydratedDocument<DiscussionChannel>;
export type DiscussionChannelModel = Model<DiscussionChannel>;

export const DiscussionChannelModel =
  (mongoose.models.DiscussionChannel as DiscussionChannelModel | undefined) ||
  mongoose.model<DiscussionChannel>(
    "DiscussionChannel",
    discussionChannelSchema,
    "discussion_channels",
  );
