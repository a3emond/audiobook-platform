import { OAuth2Client } from "google-auth-library";
import jwt, { type JwtHeader } from "jsonwebtoken";
import jwksClient from "jwks-rsa";

import { ApiError } from "../../utils/api-error.js";

export interface OAuthProfile {
  provider: "google" | "apple";
  providerId: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

function parseAudienceList(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveOAuthAudiences(multiKey: string, singleKey: string): string[] {
  const multiValue = process.env[multiKey];
  if (multiValue) {
    const parsed = parseAudienceList(multiValue);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  const singleValue = process.env[singleKey];
  if (singleValue && singleValue.trim()) {
    return [singleValue.trim()];
  }

  throw new Error(`Missing ${multiKey} or ${singleKey} environment variable`);
}

function toAudienceOption(
  audiences: string[],
): string | [string, ...string[]] {
  if (audiences.length === 1) {
    return audiences[0];
  }

  return [audiences[0], ...audiences.slice(1)];
}

const googleClientIds = resolveOAuthAudiences(
  "GOOGLE_CLIENT_IDS",
  "GOOGLE_CLIENT_ID",
);
const appleClientIds = resolveOAuthAudiences(
  "APPLE_CLIENT_IDS",
  "APPLE_CLIENT_ID",
);

const googleClient = new OAuth2Client();

const appleJwksClient = jwksClient({
  jwksUri: "https://appleid.apple.com/auth/keys",
});

function getApplePublicKey(header: JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!header.kid) {
      reject(new ApiError(401, "invalid_oauth_token"));
      return;
    }

    appleJwksClient.getSigningKey(header.kid, (err, key) => {
      if (err || !key) {
        reject(new ApiError(401, "invalid_oauth_token"));
        return;
      }

      resolve(key.getPublicKey());
    });
  });
}

export class OAuthService {
  static async verifyGoogle(idToken: string): Promise<OAuthProfile> {
    if (!idToken) {
      throw new ApiError(400, "missing_id_token");
    }

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: toAudienceOption(googleClientIds),
      });

      const payload = ticket.getPayload();

      if (!payload?.sub) {
        throw new ApiError(401, "invalid_oauth_token");
      }

      return {
        provider: "google",
        providerId: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified,
        name: payload.name,
      };
    } catch {
      throw new ApiError(401, "invalid_oauth_token");
    }
  }

  static async verifyApple(idToken: string): Promise<OAuthProfile> {
    if (!idToken) {
      throw new ApiError(400, "missing_id_token");
    }

    try {
      const decoded = jwt.decode(idToken, { complete: true }) as {
        header: JwtHeader;
      } | null;

      if (!decoded?.header) {
        throw new ApiError(401, "invalid_oauth_token");
      }

      const publicKey = await getApplePublicKey(decoded.header);

      const payload = jwt.verify(idToken, publicKey, {
        algorithms: ["RS256"],
        audience: toAudienceOption(appleClientIds),
        issuer: "https://appleid.apple.com",
      }) as jwt.JwtPayload;

      if (!payload?.sub) {
        throw new ApiError(401, "invalid_oauth_token");
      }

      return {
        provider: "apple",
        providerId: payload.sub,
        email: typeof payload.email === "string" ? payload.email : undefined,
        emailVerified:
          typeof payload.email_verified === "boolean"
            ? payload.email_verified
            : payload.email_verified === "true",
        name: typeof payload.name === "string" ? payload.name : undefined,
      };
    } catch {
      throw new ApiError(401, "invalid_oauth_token");
    }
  }
}
