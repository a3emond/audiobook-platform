/**
 * Persistence model for account authentication, refresh sessions, and OAuth sign-in.
 * Model files define how this feature is stored in MongoDB and usually carry
 * the schema, indexes, and document typing that other layers rely on as the
 * source of truth for persisted state.
 */
import mongoose, {
  Schema,
  type InferSchemaType,
  type HydratedDocument,
  type Model,
} from "mongoose";

/**
 * OAuth providers supported
 */
export const AUTH_PROVIDERS = ["google", "apple"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

/**
 * OAuth provider sub-document
 */
const providerSchema = new Schema(
  {
    type: {
      type: String,
      enum: AUTH_PROVIDERS,
      required: true,
    },
    providerId: {
      type: String, // "sub" from provider
      required: true,
    },
    linkedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  },
);

/**
 * Auth schema (credentials + providers)
 */
const authSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    /**
     * Email used for login
     * duplicated here for fast lookup
     */
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 320,
      index: true,
    },

    /**
     * Password hash (nullable for OAuth users)
     */
    passwordHash: {
      type: String,
      required: false, // auth extension: optional for OAuth
      select: false,
    },

    /**
     * Linked OAuth providers
     */
    providers: {
      type: [providerSchema], // auth extension
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/**
 * Ensure unique provider identity
 */
authSchema.index(
  { "providers.type": 1, "providers.providerId": 1 },
  { unique: true, sparse: true },
);

/**
 * Types
 */
export type Auth = InferSchemaType<typeof authSchema>;
export type AuthDocument = HydratedDocument<Auth>;
export type AuthModel = Model<Auth>;

/**
 * Model export
 */
export const AuthModel =
  (mongoose.models.Auth as AuthModel | undefined) ||
  mongoose.model<Auth>("Auth", authSchema, "auth");
