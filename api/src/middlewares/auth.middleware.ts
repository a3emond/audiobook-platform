import { Request, Response, NextFunction } from "express";
import { extractBearerToken, verifyAccessToken } from "../modules/auth/jwt.js";
import { ApiError } from "../utils/api-error.js";
import { UserRole } from "../modules/users/user.model.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: UserRole;
  };
}

export function authMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
) {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    throw new ApiError(401, "missing_token");
  }

  const payload = verifyAccessToken(token);

  req.user = {
    id: payload.sub,
    role: payload.role as UserRole,
  };

  next();
}
