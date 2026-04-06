import mongoose, {
  Schema,
  type InferSchemaType,
  type HydratedDocument,
  type Model,
} from "mongoose";

export const USER_ROLES = ["admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const profileSchema = new Schema(
  {
    displayName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    preferredLocale: {
      type: String,
      enum: ["fr", "en"],
      default: "en",
    },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 320,
      index: true,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "user",
      index: true,
    },
    profile: {
      type: profileSchema,
      default: () => ({ preferredLocale: "en" }),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userSchema.index({ createdAt: -1 });

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;
export type UserModel = Model<User>;

export const UserModel =
  (mongoose.models.User as UserModel | undefined) ||
  mongoose.model<User>("User", userSchema, "users");
