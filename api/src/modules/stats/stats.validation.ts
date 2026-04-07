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