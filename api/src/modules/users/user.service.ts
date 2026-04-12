/**
 * Core business logic for user profile reads, updates, and related validation.
 * In this codebase, services are the place where models, validation results,
 * worker/job coordination, and cross-feature rules come together so controllers
 * remain small and the domain behavior stays testable and reusable.
 */
import mongoose from "mongoose";

import type {
	AdminListUserSessionsResponseDTO,
	AdminListUsersQueryDTO,
	AdminListUsersResponseDTO,
	AdminRevokeSessionsResponseDTO,
	AdminUpdateUserRoleDTO,
	UpdateMyProfileDTO,
	UserDTO,
} from "../../dto/user.dto.js";
import { ApiError } from "../../utils/api-error.js";
import { UserModel, type UserDocument } from "./user.model.js";
import { AuthSessionModel } from "../auth/auth-session.model.js";

function toUserDTO(user: UserDocument): UserDTO {
	return {
		id: String(user._id),
		email: user.email,
		role: user.role,
		profile: {
			displayName: user.profile?.displayName ?? null,
			preferredLocale: user.profile?.preferredLocale ?? "en",
		},
		createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : undefined,
		updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : undefined,
	};
}

export class UserService {
	static async getMe(userId: string): Promise<UserDTO> {
		if (!mongoose.Types.ObjectId.isValid(userId)) {
			throw new ApiError(400, "user_invalid_id");
		}

		const user = await UserModel.findById(userId);
		if (!user) {
			throw new ApiError(404, "user_not_found");
		}

		return toUserDTO(user);
	}

	static async updateMe(userId: string, data: UpdateMyProfileDTO): Promise<UserDTO> {
		if (!mongoose.Types.ObjectId.isValid(userId)) {
			throw new ApiError(400, "user_invalid_id");
		}

		if (
			data.profile?.displayName !== undefined &&
			data.profile.displayName !== null &&
			!String(data.profile.displayName).trim()
		) {
			throw new ApiError(400, "user_invalid_display_name");
		}

		if (
			data.profile?.preferredLocale !== undefined &&
			!["fr", "en"].includes(data.profile.preferredLocale)
		) {
			throw new ApiError(400, "user_invalid_preferred_locale");
		}

		const updates: Record<string, unknown> = {};

		if (data.profile?.displayName !== undefined) {
			updates["profile.displayName"] =
				data.profile.displayName === null
					? null
					: String(data.profile.displayName).trim();
		}

		if (data.profile?.preferredLocale !== undefined) {
			updates["profile.preferredLocale"] = data.profile.preferredLocale;
		}

		if (Object.keys(updates).length === 0) {
			throw new ApiError(400, "user_empty_update");
		}

		const user = await UserModel.findByIdAndUpdate(
			userId,
			{ $set: { ...updates, updatedAt: new Date() } },
			{ returnDocument: "after" },
		);

		if (!user) {
			throw new ApiError(404, "user_not_found");
		}

		return toUserDTO(user);
	}

	static async listUsers(
		query: AdminListUsersQueryDTO = {},
	): Promise<AdminListUsersResponseDTO> {
		const limit = query.limit ?? 20;
		const offset = query.offset ?? 0;

		const filter: Record<string, unknown> = {};
		if (query.role) {
			filter.role = query.role;
		}

		if (query.q && query.q.trim()) {
			const regex = new RegExp(query.q.trim(), "i");
			filter.$or = [{ email: regex }, { "profile.displayName": regex }];
		}

		const [users, total] = await Promise.all([
			UserModel.find(filter).sort({ createdAt: -1 }).limit(limit).skip(offset),
			UserModel.countDocuments(filter),
		]);

		return {
			users: users.map(toUserDTO),
			total,
			limit,
			offset,
			hasMore: offset + users.length < total,
		};
	}

	static async getUserById(userId: string): Promise<UserDTO> {
		if (!mongoose.Types.ObjectId.isValid(userId)) {
			throw new ApiError(400, "user_invalid_id");
		}

		const user = await UserModel.findById(userId);
		if (!user) {
			throw new ApiError(404, "user_not_found");
		}

		return toUserDTO(user);
	}

	static async updateUserRole(
		actorUserId: string,
		targetUserId: string,
		data: AdminUpdateUserRoleDTO,
	): Promise<UserDTO> {
		if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
			throw new ApiError(400, "user_invalid_id");
		}

		if (!["admin", "user"].includes(data.role)) {
			throw new ApiError(400, "user_invalid_role");
		}

		if (actorUserId === targetUserId && data.role !== "admin") {
			throw new ApiError(400, "user_cannot_demote_self");
		}

		const user = await UserModel.findById(targetUserId);
		if (!user) {
			throw new ApiError(404, "user_not_found");
		}

		if (user.role === "admin" && data.role === "user") {
			const adminCount = await UserModel.countDocuments({ role: "admin" });
			if (adminCount <= 1) {
				throw new ApiError(400, "user_last_admin_demote_forbidden");
			}
		}

		user.role = data.role;
		await user.save();

		return toUserDTO(user);
	}

	static async listUserSessions(
		userId: string,
		query: { limit?: number; offset?: number } = {},
	): Promise<AdminListUserSessionsResponseDTO> {
		if (!mongoose.Types.ObjectId.isValid(userId)) {
			throw new ApiError(400, "user_invalid_id");
		}

		const limit = query.limit ?? 20;
		const offset = query.offset ?? 0;
		const filter = { userId };

		const [sessions, total] = await Promise.all([
			AuthSessionModel.find(filter).sort({ lastUsedAt: -1 }).limit(limit).skip(offset),
			AuthSessionModel.countDocuments(filter),
		]);

		return {
			sessions: sessions.map((session) => ({
				id: String(session._id),
				userId: String(session.userId),
				device: session.device ?? null,
				ip: session.ip ?? null,
				userAgent: session.userAgent ?? null,
				expiresAt: new Date(session.expiresAt).toISOString(),
				lastUsedAt: new Date(session.lastUsedAt).toISOString(),
				createdAt: session.createdAt
					? new Date(session.createdAt).toISOString()
					: undefined,
				updatedAt: session.updatedAt
					? new Date(session.updatedAt).toISOString()
					: undefined,
			})),
			total,
			limit,
			offset,
			hasMore: offset + sessions.length < total,
		};
	}

	static async revokeUserSessions(
		userId: string,
	): Promise<AdminRevokeSessionsResponseDTO> {
		if (!mongoose.Types.ObjectId.isValid(userId)) {
			throw new ApiError(400, "user_invalid_id");
		}

		const result = await AuthSessionModel.deleteMany({ userId });
		return { revoked: result.deletedCount ?? 0 };
	}
}
