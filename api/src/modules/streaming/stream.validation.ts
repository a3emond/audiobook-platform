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