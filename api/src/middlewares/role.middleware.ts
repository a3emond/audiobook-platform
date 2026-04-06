import { Response, NextFunction } from "express";
import { ApiError } from "../utils/api-error.js";
import { type AuthenticatedRequest } from "./auth.middleware.js";

/**
 * Require a specific role
 */
export function requireRole(role: "admin" | "user") {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, "unauthorized");
    }

    if (req.user.role !== role) {
      throw new ApiError(403, "forbidden");
    }

    next();
  };
}

/**
 * Require one of multiple roles
 */
export function requireRoles(roles: ("admin" | "user")[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, "unauthorized");
    }

    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, "forbidden");
    }

    next();
  };
}
