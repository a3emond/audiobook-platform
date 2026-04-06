import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { ApiError } from "../../utils/api-error.js";

export interface AccessTokenPayload extends JwtPayload {
  sub: string;
  role: string;
}

const JWT_SECRET = process.env.JWT_SECRET as string;

const ACCESS_TOKEN_TTL =
  (process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"]) || "12h";

export function signAccessToken(payload: {
  userId: string;
  role: string;
}): string {
  return jwt.sign(
    {
      sub: payload.userId,
      role: payload.role,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (typeof decoded !== "object" || !decoded.sub) {
      throw new ApiError(401, "invalid_token");
    }

    return decoded as AccessTokenPayload;
  } catch {
    throw new ApiError(401, "invalid_token");
  }
}

export function extractBearerToken(header?: string): string | null {
  if (!header) return null;

  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;

  return parts[1];
}
