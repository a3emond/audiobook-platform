import { type Request, type Response, type NextFunction } from "express";

import { ApiError } from "../../utils/api-error.js";

export function validateUpdateMyProfileRequest(
	req: Request,
	_res: Response,
	next: NextFunction,
) {
	const body = req.body as Record<string, unknown>;
	if (!body || typeof body !== "object") {
		throw new ApiError(400, "user_invalid_payload");
	}

	if (body.profile !== undefined && typeof body.profile !== "object") {
		throw new ApiError(400, "user_invalid_payload");
	}

	const profile = body.profile as Record<string, unknown> | undefined;
	if (profile?.displayName !== undefined) {
		if (profile.displayName !== null && typeof profile.displayName !== "string") {
			throw new ApiError(400, "user_invalid_display_name");
		}
	}

	if (profile?.preferredLocale !== undefined) {
		if (profile.preferredLocale !== "fr" && profile.preferredLocale !== "en") {
			throw new ApiError(400, "user_invalid_preferred_locale");
		}
	}

	next();
}