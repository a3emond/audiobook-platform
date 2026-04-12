/**
 * Authorization guard for role-based access. After auth has attached the user,
 * this middleware blocks non-admin callers from routes that mutate catalog,
 * worker, or user-management state. It keeps permission checks explicit in the
 * route layer instead of buried in every handler.
 */
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
