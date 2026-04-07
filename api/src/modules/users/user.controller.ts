import { type Request, type Response } from "express";

import type { AuthenticatedRequest } from "../../middlewares/auth.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import type {
	AdminUpdateUserRoleDTO,
	UpdateMyProfileDTO,
} from "../../dto/user.dto.js";
import { UserService } from "./user.service.js";

function requireUserId(req: AuthenticatedRequest): string {
	const userId = req.user?.id;
	if (!userId) {
		throw new ApiError(401, "missing_token");
	}

	return userId;
}

export class UserController {
	static async getMe(req: AuthenticatedRequest, res: Response) {
		const result = await UserService.getMe(requireUserId(req));
		res.status(200).json(result);
	}

	static async updateMe(
		req: AuthenticatedRequest & { body: UpdateMyProfileDTO },
		res: Response,
	) {
		const result = await UserService.updateMe(requireUserId(req), req.body);
		res.status(200).json(result);
	}

	static async listUsers(
		req: Request<
			unknown,
			unknown,
			unknown,
			{ q?: string; role?: string; limit?: string; offset?: string }
		>,
		res: Response,
	) {
		if (req.query.role && !["admin", "user"].includes(req.query.role)) {
			throw new ApiError(400, "user_invalid_role_filter");
		}

		const limit = req.query.limit ? Number(req.query.limit) : undefined;
		const offset = req.query.offset ? Number(req.query.offset) : undefined;

		if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
			throw new ApiError(400, "user_invalid_limit");
		}

		if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
			throw new ApiError(400, "user_invalid_offset");
		}

		const result = await UserService.listUsers({
			q: req.query.q,
			role: req.query.role as "admin" | "user" | undefined,
			limit,
			offset,
		});
		res.status(200).json(result);
	}

	static async getUser(req: Request<{ userId?: string }>, res: Response) {
		const result = await UserService.getUserById(String(req.params.userId));
		res.status(200).json(result);
	}

	static async updateUserRole(
		req: AuthenticatedRequest & {
			params: { userId?: string };
			body: AdminUpdateUserRoleDTO;
		},
		res: Response,
	) {
		const result = await UserService.updateUserRole(
			requireUserId(req),
			String(req.params.userId),
			req.body,
		);
		res.status(200).json(result);
	}

	static async listUserSessions(
		req: Request<
			{ userId?: string },
			unknown,
			unknown,
			{ limit?: string; offset?: string }
		>,
		res: Response,
	) {
		const limit = req.query.limit ? Number(req.query.limit) : undefined;
		const offset = req.query.offset ? Number(req.query.offset) : undefined;

		if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
			throw new ApiError(400, "user_invalid_limit");
		}

		if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
			throw new ApiError(400, "user_invalid_offset");
		}

		const result = await UserService.listUserSessions(String(req.params.userId), {
			limit,
			offset,
		});
		res.status(200).json(result);
	}

	static async revokeUserSessions(req: Request<{ userId?: string }>, res: Response) {
		const result = await UserService.revokeUserSessions(String(req.params.userId));
		res.status(200).json(result);
	}
}