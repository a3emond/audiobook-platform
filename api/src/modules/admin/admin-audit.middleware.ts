/**
 * Captures admin-side actions for auditability. This platform lets admins edit
 * books, queue worker jobs, and manage users, so important operations need a
 * trace explaining who changed what and when. Keeping that concern in middleware
 * avoids duplicating audit logging across every admin handler.
 */
import mongoose from "mongoose";
import { type Response, type NextFunction } from "express";

import type { AuthenticatedRequest } from "../../middlewares/auth.middleware.js";
import { AdminAuditModel } from "./admin-audit.model.js";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function adminAuditMiddleware(
	req: AuthenticatedRequest,
	res: Response,
	next: NextFunction,
) {
	if (!MUTATION_METHODS.has(req.method)) {
		next();
		return;
	}

	const actorUserId = req.user?.id;
	if (!actorUserId) {
		next();
		return;
	}

	res.on("finish", () => {
		const rawUserId = req.params.userId;
		const rawBookId = req.params.bookId;
		const targetUserId =
			typeof rawUserId === "string" && mongoose.Types.ObjectId.isValid(rawUserId)
				? new mongoose.Types.ObjectId(rawUserId)
				: null;
		const targetBookId =
			typeof rawBookId === "string" && mongoose.Types.ObjectId.isValid(rawBookId)
				? new mongoose.Types.ObjectId(rawBookId)
				: null;

		void AdminAuditModel.create({
			actorUserId: new mongoose.Types.ObjectId(actorUserId),
			method: req.method,
			path: req.originalUrl,
			statusCode: res.statusCode,
			targetUserId,
			targetBookId,
			requestId: req.header("x-request-id") ?? null,
			ip: req.ip ?? null,
			userAgent: req.header("user-agent") ?? null,
			metadata: {
				query: req.query,
			},
		}).catch(() => {
			/* ignore audit logging errors */
		});
	});

	next();
}