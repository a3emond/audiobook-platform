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
 * AuthSession model
 * - refresh-token-backed session
 * - one document per device
 * - used for rotation, revocation, and tracking
 */
const authSessionSchema = new Schema(
  {
    /**
     * Linked user
     */
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /**
     * Hashed refresh token
     * (never store raw token)
     */
    tokenHash: {
      type: String,
      required: true,
      select: false,
    },

    /**
     * Optional device label
     */
    device: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },

    /**
     * Metadata
     */
    ip: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
    },

    /**
     * Expiration (TTL)
     */
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    /**
     * Updated on each refresh
     */
    lastUsedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/**
 * TTL index
 */
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Query optimization
 */
authSessionSchema.index({ userId: 1, lastUsedAt: -1 });

/**
 * Types
 */
export type AuthSession = InferSchemaType<typeof authSessionSchema>;
export type AuthSessionDocument = HydratedDocument<AuthSession>;
export type AuthSessionModelType = Model<AuthSession>;

/**
 * Model export
 */
export const AuthSessionModel =
  (mongoose.models.AuthSession as AuthSessionModelType | undefined) ||
  mongoose.model<AuthSession>(
    "AuthSession",
    authSessionSchema,
    "auth_sessions", // ✅ renamed collection
  );
