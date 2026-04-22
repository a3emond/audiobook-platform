import mongoose, {
  Schema,
  type InferSchemaType,
  type HydratedDocument,
  type Model,
} from "mongoose";

const editorialItemSchema = new Schema(
  {
    itemType: {
      type: String,
      enum: ["series", "book"],
      required: true,
    },
    target: {
      type: String,
      required: true,
      trim: true,
    },
    position: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    badge: {
      type: String,
      trim: true,
      default: null,
    },
    kicker: {
      type: String,
      trim: true,
      default: null,
    },
    customTitle: {
      type: String,
      trim: true,
      default: null,
    },
    customImage: {
      type: String,
      trim: true,
      default: null,
    },
    startsAt: {
      type: Date,
      default: null,
    },
    endsAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    _id: true,
    versionKey: false,
  },
);

const editorialBlockSchema = new Schema(
  {
    slug: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    scope: {
      type: String,
      enum: ["library"],
      default: "library",
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    subtitle: {
      type: String,
      trim: true,
      default: null,
      maxlength: 280,
    },
    displayType: {
      type: String,
      enum: ["fan_cards"],
      default: "fan_cards",
    },
    theme: {
      type: String,
      trim: true,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    startsAt: {
      type: Date,
      default: null,
      index: true,
    },
    endsAt: {
      type: Date,
      default: null,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    maxItems: {
      type: Number,
      default: 8,
      min: 1,
      max: 24,
    },
    items: {
      type: [editorialItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

editorialBlockSchema.index({ scope: 1, isActive: 1, sortOrder: 1, updatedAt: -1 });

export type EditorialBlock = InferSchemaType<typeof editorialBlockSchema>;
export type EditorialBlockDocument = HydratedDocument<EditorialBlock>;
export type EditorialBlockModelType = Model<EditorialBlock>;

export const EditorialBlockModel =
  (mongoose.models.EditorialBlock as EditorialBlockModelType | undefined) ||
  mongoose.model<EditorialBlock>("EditorialBlock", editorialBlockSchema, "editorial_blocks");
