/**
 * Final Express error boundary that normalizes thrown exceptions into stable
 * API responses. This keeps the contract predictable for every client while
 * also preventing stack traces and low-level failures from leaking through
 * the audiobook API surface.
 */
import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/api-error.js";
import { logger } from "../config/logger.js";

function shouldLogAsInfo(status: number, message: string): boolean {
  return status === 409 && message.startsWith("idempotency_");
}

function shouldLogAsWarn(status: number): boolean {
  return status >= 400 && status < 500;
}

export function errorMiddleware(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const isApiError = err instanceof ApiError;
  const status = isApiError ? err.status : 500;
  const message = isApiError ? err.message : "Internal server error";
  const meta = {
    method: req.method,
    path: req.path,
    status,
    message,
    stack:
      !isApiError && err && typeof err === "object" && "stack" in err
        ? String((err as { stack?: unknown }).stack)
        : undefined,
  };

  if (shouldLogAsInfo(status, message)) {
    logger.info("Request failed", meta);
  } else if (shouldLogAsWarn(status)) {
    logger.warn("Request failed", meta);
  } else {
    logger.error("Request failed", meta);
  }

  res.status(status).json({
    message: isApiError && err.expose ? err.message : "Internal server error",
  });
}
