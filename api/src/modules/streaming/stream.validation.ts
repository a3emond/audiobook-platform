/**
 * Validation and request-shaping for authenticated audio and cover delivery plus resume metadata.
 * This exists so malformed payloads are rejected before they reach business
 * logic, keeping controller code smaller and making input rules consistent
 * across every client that talks to the API.
 */
import { type Request, type Response, type NextFunction } from "express";

import { ApiError } from "../../utils/api-error.js";

export function validateRangeHeader(
	req: Request,
	_res: Response,
	next: NextFunction,
) {
	const range = req.header("range");
	if (!range) {
		next();
		return;
	}

	if (!/^bytes=\d*-\d*$/.test(range)) {
		throw new ApiError(416, "stream_invalid_range");
	}

	next();
}