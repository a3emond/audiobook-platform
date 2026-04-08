import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/api-error.js";
import { logger } from "../config/logger.js";

export function errorMiddleware(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const isApiError = err instanceof ApiError;

  const status = isApiError ? err.status : 500;

  logger.error("Request failed", {
    method: req.method,
    path: req.path,
    status,
    message: isApiError ? err.message : "Internal server error",
    stack:
      err && typeof err === "object" && "stack" in err
        ? String((err as { stack?: unknown }).stack)
        : undefined,
  });

  res.status(status).json({
    message: isApiError && err.expose ? err.message : "Internal server error",
  });
}
