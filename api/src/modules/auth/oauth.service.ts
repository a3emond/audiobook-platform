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

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const appleClientId = process.env.APPLE_CLIENT_ID;

if (!googleClientId) {
  throw new Error("Missing GOOGLE_CLIENT_ID environment variable");
}

if (!appleClientId) {
  throw new Error("Missing APPLE_CLIENT_ID environment variable");
}

const googleClient = new OAuth2Client(googleClientId);

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
        audience: googleClientId,
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
        audience: appleClientId,
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
