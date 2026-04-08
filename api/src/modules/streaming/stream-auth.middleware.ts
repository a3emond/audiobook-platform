import { type Request, type Response, type NextFunction } from "express";

import { extractBearerToken, tryVerifyAccessToken } from "../auth/jwt.js";
import { type AuthenticatedRequest } from "../../middlewares/auth.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { USER_ROLES, type UserRole } from "../users/user.model.js";

function parseRole(role: unknown): UserRole {
  return USER_ROLES.includes(role as UserRole) ? (role as UserRole) : "user";
}

// Streaming auth supports either:
// 1) Authorization: Bearer <access-token>
// 2) access_token=<access-token> query param (needed for <audio src=...>)
export function streamAuthMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
) {
  const bearer = extractBearerToken(req.headers.authorization);
  const queryToken = typeof req.query.access_token === "string" ? req.query.access_token : null;
  const token = bearer ?? queryToken;

  if (!token) {
    throw new ApiError(401, "missing_token");
  }

  const payload = tryVerifyAccessToken(token);
  if (!payload?.sub) {
    throw new ApiError(401, "invalid_token");
  }

  req.user = {
    id: String(payload.sub),
    role: parseRole(payload.role),
  };

  next();
}
