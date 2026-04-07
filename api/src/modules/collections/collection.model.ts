import mongoose, {
  Schema,
  type InferSchemaType,
  type HydratedDocument,
  type Model,
  Types,
} from "mongoose";

const collectionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
      index: true,
    },
    bookIds: {
      type: [Schema.Types.ObjectId],
      ref: "Book",
      default: [],
    },
    cover: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

collectionSchema.path("bookIds").set((values: Types.ObjectId[]) => {
  const normalized = (values ?? []).map((value) => String(value));
  return Array.from(new Set(normalized)).map(
    (value) => new mongoose.Types.ObjectId(value),
  );
});

collectionSchema.index({ userId: 1, updatedAt: -1 });
collectionSchema.index({ userId: 1, name: 1 });
collectionSchema.index({ createdAt: -1 });

export type Collection = InferSchemaType<typeof collectionSchema>;
export type CollectionDocument = HydratedDocument<Collection>;
export type CollectionModelType = Model<Collection>;

export const CollectionModel =
  (mongoose.models.Collection as CollectionModelType | undefined) ||
  mongoose.model<Collection>("Collection", collectionSchema, "collections");
