/**
 * HTTP controller for user settings, playback preferences, and profile customization.
 * Controllers in this API are intentionally thin: they translate Express
 * request data into validated service inputs and choose response status codes,
 * while the real business rules live below in the service/model layer.
 */
import { type Response } from "express";

import { type AuthenticatedRequest } from "../../middlewares/auth.middleware.js";
import type { UpdateSettingsDTO } from "../../dto/settings.dto.js";
import { ApiError } from "../../utils/api-error.js";
import { SettingsService } from "./settings.service.js";

function requireUserId(req: AuthenticatedRequest): string {
	const userId = req.user?.id;
	if (!userId) {
		throw new ApiError(401, "missing_token");
	}

	return userId;
}

export class SettingsController {
	static async getMine(req: AuthenticatedRequest, res: Response) {
		const result = await SettingsService.getForUser(requireUserId(req));
		res.status(200).json(result);
	}

	static async updateMine(
		req: AuthenticatedRequest & { body: UpdateSettingsDTO },
		res: Response,
	) {
		const result = await SettingsService.updateForUser(
			requireUserId(req),
			req.body,
		);
		res.status(200).json(result);
	}
}
