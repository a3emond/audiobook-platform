import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/api-error.js";

export function errorMiddleware(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const isApiError = err instanceof ApiError;

  const status = isApiError ? err.status : 500;

  res.status(status).json({
    message: isApiError && err.expose ? err.message : "Internal server error",
  });
}
