/**
 * Core business logic for account authentication, refresh sessions, and OAuth sign-in.
 * In this codebase, services are the place where models, validation results,
 * worker/job coordination, and cross-feature rules come together so controllers
 * remain small and the domain behavior stays testable and reusable.
 */
import bcrypt from "bcrypt";
import crypto from "crypto";

import { UserModel } from "../users/user.model.js";
import { AuthModel } from "./auth.model.js";
import { AuthSessionModel } from "./auth-session.model.js";
import { signAccessToken } from "./jwt.js";
import { type OAuthProfile } from "./oauth.service.js";

import { ApiError } from "../../utils/api-error.js";
import { logger } from "../../config/logger.js";
import type { UserDTO } from "../../dto/user.dto.js";
import type {
  AuthResponseDTO,
  AuthTokensDTO
} from "../../dto/auth.dto.js";

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 60);
const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * REFRESH_TTL_DAYS;

// Token/session helpers are intentionally pure so auth flows can reuse them.
function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildRefreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_MS);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function resolveOAuthEmail(profile: OAuthProfile): string {
  if (profile.email) {
    return normalizeEmail(profile.email);
  }

  return `${profile.providerId}@${profile.provider}.local`;
}

function sanitizePreferredLocale(preferredLocale?: "fr" | "en"): "fr" | "en" {
  return preferredLocale === "fr" ? "fr" : "en";
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

function toUserDTO(user: {
  _id: unknown;
  email: string;
  role: "admin" | "user";
  profile?: {
    displayName?: string | null;
    preferredLocale?: "fr" | "en";
  };
  createdAt?: Date;
  updatedAt?: Date;
}): UserDTO {
  return {
    id: String(user._id),
    email: user.email,
    role: user.role,
    profile: {
      displayName: user.profile?.displayName ?? null,
      preferredLocale: user.profile?.preferredLocale ?? "en",
    },
    createdAt: user.createdAt?.toISOString(),
    updatedAt: user.updatedAt?.toISOString(),
  };
}

export class AuthService {
  // OAuth provider lookup by provider id is the fastest path when provider
  // linkage already exists.
  private static async tryLoginByProvider(
    profile: OAuthProfile,
  ): Promise<AuthResponseDTO | null> {
    const providerAuth = await AuthModel.findOne({
      "providers.type": profile.provider,
      "providers.providerId": profile.providerId,
    });

    if (!providerAuth) {
      return null;
    }

    const user = await UserModel.findById(providerAuth.userId);
    if (!user) {
      throw new ApiError(404, "user_not_found");
    }

    const tokens = await this.createAuthSession(user._id.toString(), user.role);
    return {
      tokens,
      user: toUserDTO(user),
    };
  }

  // Access token is short-lived JWT; refresh token is persisted as hash only.
  private static async createAuthSession(
    userId: string,
    role: "admin" | "user",
  ): Promise<AuthTokensDTO> {
    const refreshToken = generateRefreshToken();

    await AuthSessionModel.create({
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: buildRefreshExpiry(),
      lastUsedAt: new Date(),
    });

    logger.debug("auth_session created", { userId });

    return {
      accessToken: signAccessToken({ userId, role }),
      refreshToken,
    };
  }

  // Local register creates both user profile and auth credentials records.
  static async register(
    email: string,
    password: string,
    displayName?: string,
    preferredLocale?: "fr" | "en",
  ): Promise<AuthResponseDTO> {
    if (!email || !password) {
      throw new ApiError(400, "email_and_password_required");
    }

    const normalizedEmail = normalizeEmail(email);

    const existingUser = await UserModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new ApiError(409, "email_already_used");
    }

    const existingAuth = await AuthModel.findOne({ email: normalizedEmail });
    if (existingAuth) {
      throw new ApiError(409, "email_already_used");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await UserModel.create({
      email: normalizedEmail,
      profile: {
        displayName: displayName?.trim() || null,
        preferredLocale: sanitizePreferredLocale(preferredLocale),
      },
    });

    await AuthModel.create({
      userId: user._id,
      email: normalizedEmail,
      passwordHash,
      providers: [],
    });

    const tokens = await this.createAuthSession(user._id.toString(), user.role);

    logger.debug("user registered", {
      userId: user._id,
      email: normalizedEmail,
    });

    return {
      tokens,
      user: toUserDTO(user),
    };
  }

  // Email/password login validates against the auth record and hydrates user DTO.
  static async login(
    email: string,
    password: string,
  ): Promise<AuthResponseDTO> {
    if (!email || !password) {
      throw new ApiError(400, "email_and_password_required");
    }

    const normalizedEmail = normalizeEmail(email);

    const auth = await AuthModel.findOne({ email: normalizedEmail }).select(
      "+passwordHash",
    );

    if (!auth?.passwordHash) {
      throw new ApiError(401, "invalid_credentials");
    }

    const passwordValid = await bcrypt.compare(password, auth.passwordHash);
    if (!passwordValid) {
      throw new ApiError(401, "invalid_credentials");
    }

    const user = await UserModel.findById(auth.userId);
    if (!user) {
      throw new ApiError(404, "user_not_found");
    }

    const tokens = await this.createAuthSession(user._id.toString(), user.role);

    logger.debug("user logged in", {
      userId: user._id,
      email: normalizedEmail,
    });

    return {
      tokens,
      user: toUserDTO(user),
    };
  }

  // OAuth login prefers provider link, then falls back to email association,
  // then creates a new account when needed.
  static async loginWithOAuth(
    profile: OAuthProfile,
    preferredLocale?: "fr" | "en",
  ): Promise<AuthResponseDTO> {
    let auth = await AuthModel.findOne({
      "providers.type": profile.provider,
      "providers.providerId": profile.providerId,
    });

    if (auth) {
      const user = await UserModel.findById(auth.userId);
      if (!user) {
        throw new ApiError(404, "user_not_found");
      }

      const tokens = await this.createAuthSession(
        user._id.toString(),
        user.role,
      );

      logger.debug("oauth login", {
        userId: user._id,
        provider: profile.provider,
      });

      return {
        tokens,
        user: toUserDTO(user),
      };
    }

    const email = resolveOAuthEmail(profile);

    auth = await AuthModel.findOne({ email });

    if (auth) {
      if (!Array.isArray(auth.providers)) {
        auth.set("providers", []);
      }

      const alreadyLinked = auth.providers.some(
        (provider) =>
          provider.type === profile.provider &&
          provider.providerId === profile.providerId,
      );

      if (!alreadyLinked) {
        auth.providers.push({
          type: profile.provider,
          providerId: profile.providerId,
          linkedAt: new Date(),
        });

        try {
          await auth.save();
        } catch (error: unknown) {
          if (!isDuplicateKeyError(error)) {
            throw error;
          }

          const existing = await this.tryLoginByProvider(profile);
          if (existing) {
            logger.warn("oauth provider already linked to another account", {
              provider: profile.provider,
            });
            return existing;
          }

          throw new ApiError(500, "oauth_linking_failed");
        }
      }

      const user = await UserModel.findById(auth.userId);
      if (!user) {
        throw new ApiError(404, "user_not_found");
      }

      const tokens = await this.createAuthSession(
        user._id.toString(),
        user.role,
      );

      logger.debug("oauth provider linked/login", {
        userId: user._id,
        provider: profile.provider,
      });

      return {
        tokens,
        user: toUserDTO(user),
      };
    }

    // Recovery path: user exists without an auth document (legacy/inconsistent data).
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      try {
        await AuthModel.create({
          userId: existingUser._id,
          email,
          passwordHash: undefined,
          providers: [
            {
              type: profile.provider,
              providerId: profile.providerId,
              linkedAt: new Date(),
            },
          ],
        });
      } catch (error: unknown) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }

      const linkedAuth = await AuthModel.findOne({ userId: existingUser._id });
      if (!linkedAuth) {
        const existing = await this.tryLoginByProvider(profile);
        if (existing) {
          logger.warn("oauth provider conflict resolved via provider lookup", {
            provider: profile.provider,
          });
          return existing;
        }

        throw new ApiError(500, "oauth_linking_failed");
      }

      if (!Array.isArray(linkedAuth.providers)) {
        linkedAuth.set("providers", []);
      }

      const alreadyLinked = linkedAuth.providers.some(
        (provider) =>
          provider.type === profile.provider &&
          provider.providerId === profile.providerId,
      );

      if (!alreadyLinked) {
        linkedAuth.providers.push({
          type: profile.provider,
          providerId: profile.providerId,
          linkedAt: new Date(),
        });
        await linkedAuth.save();
      }

      const tokens = await this.createAuthSession(
        existingUser._id.toString(),
        existingUser.role,
      );

      logger.debug("oauth linked to existing user", {
        userId: existingUser._id,
        provider: profile.provider,
      });

      return {
        tokens,
        user: toUserDTO(existingUser),
      };
    }

    const user = await UserModel.create({
      email,
      profile: {
        displayName: profile.name?.trim() || null,
        preferredLocale: sanitizePreferredLocale(preferredLocale),
      },
    });

    await AuthModel.create({
      userId: user._id,
      email,
      passwordHash: undefined,
      providers: [
        {
          type: profile.provider,
          providerId: profile.providerId,
          linkedAt: new Date(),
        },
      ],
    });

    const tokens = await this.createAuthSession(user._id.toString(), user.role);

    logger.debug("oauth user created", {
      userId: user._id,
      provider: profile.provider,
    });

    return {
      tokens,
      user: toUserDTO(user),
    };
  }

  static async refresh(refreshToken: string): Promise<AuthTokensDTO> {
    if (!refreshToken) {
      throw new ApiError(400, "missing_refresh_token");
    }

    const tokenHash = hashToken(refreshToken);

    const authSession = await AuthSessionModel.findOne({ tokenHash });
    if (!authSession) {
      throw new ApiError(401, "invalid_session");
    }

    if (authSession.expiresAt < new Date()) {
      await authSession.deleteOne();
      throw new ApiError(401, "session_expired");
    }

    const user = await UserModel.findById(authSession.userId);
    if (!user) {
      throw new ApiError(404, "user_not_found");
    }

    const newRefreshToken = generateRefreshToken();

    authSession.tokenHash = hashToken(newRefreshToken);
    authSession.expiresAt = buildRefreshExpiry();
    authSession.lastUsedAt = new Date();

    await authSession.save();

    logger.debug("auth_session rotated", { userId: user._id });

    return {
      accessToken: signAccessToken({
        userId: user._id.toString(),
        role: user.role,
      }),
      refreshToken: newRefreshToken,
    };
  }

  static async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) {
      throw new ApiError(400, "missing_refresh_token");
    }

    const tokenHash = hashToken(refreshToken);

    await AuthSessionModel.deleteOne({ tokenHash });

    logger.debug("auth_session revoked");
  }

  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const auth = await AuthModel.findOne({ userId }).select("+passwordHash");
    if (!auth?.passwordHash) {
      throw new ApiError(400, "password_auth_not_available");
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      auth.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new ApiError(401, "invalid_credentials");
    }

    auth.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await auth.save();

    logger.debug("auth_password_changed", { userId });
  }

  static async changeEmail(
    userId: string,
    currentPassword: string,
    newEmail: string,
  ): Promise<UserDTO> {
    const auth = await AuthModel.findOne({ userId }).select("+passwordHash");
    if (!auth?.passwordHash) {
      throw new ApiError(400, "password_auth_not_available");
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      auth.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new ApiError(401, "invalid_credentials");
    }

    const normalizedEmail = normalizeEmail(newEmail);

    if (normalizedEmail === auth.email) {
      throw new ApiError(400, "email_unchanged");
    }

    const [emailOnAnotherAuth, emailOnAnotherUser] = await Promise.all([
      AuthModel.exists({ email: normalizedEmail, userId: { $ne: userId } }),
      UserModel.exists({ email: normalizedEmail, _id: { $ne: userId } }),
    ]);

    if (emailOnAnotherAuth || emailOnAnotherUser) {
      throw new ApiError(409, "email_already_used");
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      throw new ApiError(404, "user_not_found");
    }

    user.email = normalizedEmail;
    auth.email = normalizedEmail;

    await Promise.all([user.save(), auth.save()]);

    logger.debug("auth_email_changed", { userId });

    return toUserDTO(user);
  }

  static async getCurrentUser(userId: string): Promise<UserDTO> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new ApiError(404, "user_not_found");
    }

    return toUserDTO(user);
  }
}
