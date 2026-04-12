/**
 * Validation and request-shaping for listening analytics, session history, and usage reporting.
 * This exists so malformed payloads are rejected before they reach business
 * logic, keeping controller code smaller and making input rules consistent
 * across every client that talks to the API.
 */
import { type Request, type Response, type NextFunction } from "express";

import { ApiError } from "../../utils/api-error.js";

const SESSION_DEVICES = new Set(["web", "ios", "android", "desktop", "unknown"]);

export function validateCreateSessionRequest(
	req: Request,
	_res: Response,
	next: NextFunction,
) {
	const body = req.body as Record<string, unknown>;

	if (!body || typeof body !== "object") {
		throw new ApiError(400, "session_invalid_payload");
	}

	if (typeof body.bookId !== "string" || !body.bookId) {
		throw new ApiError(400, "book_invalid_id");
	}

	if (typeof body.startedAt !== "string" || typeof body.endedAt !== "string") {
		throw new ApiError(400, "session_invalid_dates");
	}

	for (const key of ["listenedSeconds", "startPositionSeconds", "endPositionSeconds"]) {
		if (typeof body[key] !== "number" || Number.isNaN(body[key])) {
			throw new ApiError(400, "session_invalid_positions");
		}
	}

	if (body.device !== undefined) {
		if (typeof body.device !== "string" || !SESSION_DEVICES.has(body.device)) {
			throw new ApiError(400, "session_invalid_device");
		}
	}

	next();
}