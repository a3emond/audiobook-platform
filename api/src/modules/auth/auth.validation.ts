import { Request, Response, NextFunction } from "express";

import { ApiError } from "../../utils/api-error.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const DISPLAY_NAME_MAX_LENGTH = 120;

function assertBodyObject(body: unknown): asserts body is Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_payload");
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateRegisterRequest(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  assertBodyObject(req.body);

  const { email, password, displayName } = req.body;

  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    throw new ApiError(400, "email_and_password_required");
  }

  if (!EMAIL_REGEX.test(email.trim().toLowerCase())) {
    throw new ApiError(400, "invalid_email");
  }

  const passwordLength = password.length;
  if (
    passwordLength < PASSWORD_MIN_LENGTH ||
    passwordLength > PASSWORD_MAX_LENGTH
  ) {
    throw new ApiError(400, "invalid_password");
  }

  if (displayName !== undefined) {
    if (displayName !== null && typeof displayName !== "string") {
      throw new ApiError(400, "invalid_display_name");
    }

    if (
      typeof displayName === "string" &&
      displayName.trim().length > DISPLAY_NAME_MAX_LENGTH
    ) {
      throw new ApiError(400, "invalid_display_name");
    }
  }

  next();
}

export function validateLoginRequest(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  assertBodyObject(req.body);

  const { email, password } = req.body;

  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    throw new ApiError(400, "email_and_password_required");
  }

  if (!EMAIL_REGEX.test(email.trim().toLowerCase())) {
    throw new ApiError(400, "invalid_email");
  }

  next();
}

export function validateRefreshRequest(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  assertBodyObject(req.body);

  const { refreshToken } = req.body;
  if (!isNonEmptyString(refreshToken)) {
    throw new ApiError(400, "missing_refresh_token");
  }

  next();
}

export function validateLogoutRequest(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  assertBodyObject(req.body);

  const { refreshToken } = req.body;
  if (!isNonEmptyString(refreshToken)) {
    throw new ApiError(400, "missing_refresh_token");
  }

  next();
}

export function validateOAuthLoginRequest(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  assertBodyObject(req.body);

  const { idToken } = req.body;
  if (!isNonEmptyString(idToken)) {
    throw new ApiError(400, "missing_id_token");
  }

  next();
}