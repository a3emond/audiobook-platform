/**
 * Core business logic for user settings, playback preferences, and profile customization.
 * In this codebase, services are the place where models, validation results,
 * worker/job coordination, and cross-feature rules come together so controllers
 * remain small and the domain behavior stays testable and reusable.
 */
import mongoose from "mongoose";

import type { SettingsDTO, UpdateSettingsDTO } from "../../dto/settings.dto.js";
import { ApiError } from "../../utils/api-error.js";
import {
	JUMP_VALUES,
	SettingsModel,
	type UserSettingsDocument,
} from "./settings.model.js";

function toSettingsDTO(settings: UserSettingsDocument): SettingsDTO {
	return {
		locale: settings.locale,
		player: {
			forwardJumpSeconds: settings.player.forwardJumpSeconds,
			backwardJumpSeconds: settings.player.backwardJumpSeconds,
			resumeRewind: {
				enabled: settings.player.resumeRewind.enabled,
				thresholdSinceLastListenSeconds:
					settings.player.resumeRewind.thresholdSinceLastListenSeconds,
				rewindSeconds: settings.player.resumeRewind.rewindSeconds,
			},
			playbackRate: settings.player.playbackRate,
			autoMarkCompletedThresholdSeconds:
				settings.player.autoMarkCompletedThresholdSeconds,
			sleepTimerMode: settings.player.sleepTimerMode ?? "off",
		},
		library: {
			showCompleted: settings.library.showCompleted,
		},
	};
}

const SLEEP_TIMER_MODES = ["off", "15m", "30m", "45m", "60m", "chapter"] as const;

async function findOrCreateSettings(userId: string): Promise<UserSettingsDocument> {
	const existing = await SettingsModel.findOne({ userId });
	if (existing) {
		return existing;
	}

	return SettingsModel.create({
		userId: new mongoose.Types.ObjectId(userId),
	});
}

function validateUpdate(data: UpdateSettingsDTO): void {
	if (data.locale !== undefined && !["fr", "en"].includes(data.locale)) {
		throw new ApiError(400, "settings_invalid_locale");
	}

	if (
		data.player?.forwardJumpSeconds !== undefined &&
		!JUMP_VALUES.includes(data.player.forwardJumpSeconds)
	) {
		throw new ApiError(400, "settings_invalid_forward_jump");
	}

	if (
		data.player?.backwardJumpSeconds !== undefined &&
		!JUMP_VALUES.includes(data.player.backwardJumpSeconds)
	) {
		throw new ApiError(400, "settings_invalid_backward_jump");
	}

	if (
		data.player?.resumeRewind?.rewindSeconds !== undefined &&
		!JUMP_VALUES.includes(data.player.resumeRewind.rewindSeconds)
	) {
		throw new ApiError(400, "settings_invalid_resume_rewind_jump");
	}

	if (
		data.player?.playbackRate !== undefined &&
		(data.player.playbackRate < 0.5 || data.player.playbackRate > 3)
	) {
		throw new ApiError(400, "settings_invalid_playback_rate");
	}

	if (
		data.player?.autoMarkCompletedThresholdSeconds !== undefined &&
		data.player.autoMarkCompletedThresholdSeconds < 0
	) {
		throw new ApiError(400, "settings_invalid_completion_threshold");
	}

	if (
		data.player?.resumeRewind?.thresholdSinceLastListenSeconds !== undefined &&
		data.player.resumeRewind.thresholdSinceLastListenSeconds < 0
	) {
		throw new ApiError(400, "settings_invalid_resume_threshold");
	}

	if (
		data.player?.sleepTimerMode !== undefined &&
		!SLEEP_TIMER_MODES.includes(data.player.sleepTimerMode)
	) {
		throw new ApiError(400, "settings_invalid_sleep_timer_mode");
	}

}

export class SettingsService {
	static async getForUser(userId: string): Promise<SettingsDTO> {
		const settings = await findOrCreateSettings(userId);
		return toSettingsDTO(settings);
	}

	static async updateForUser(
		userId: string,
		data: UpdateSettingsDTO,
	): Promise<SettingsDTO> {
		validateUpdate(data);

		const settings = await findOrCreateSettings(userId);

		if (data.locale !== undefined) {
			settings.locale = data.locale;
		}

		if (data.player?.forwardJumpSeconds !== undefined) {
			settings.player.forwardJumpSeconds = data.player.forwardJumpSeconds;
		}

		if (data.player?.backwardJumpSeconds !== undefined) {
			settings.player.backwardJumpSeconds = data.player.backwardJumpSeconds;
		}

		if (data.player?.resumeRewind?.enabled !== undefined) {
			settings.player.resumeRewind.enabled = data.player.resumeRewind.enabled;
		}

		if (data.player?.resumeRewind?.thresholdSinceLastListenSeconds !== undefined) {
			settings.player.resumeRewind.thresholdSinceLastListenSeconds =
				data.player.resumeRewind.thresholdSinceLastListenSeconds;
		}

		if (data.player?.resumeRewind?.rewindSeconds !== undefined) {
			settings.player.resumeRewind.rewindSeconds =
				data.player.resumeRewind.rewindSeconds;
		}

		if (data.player?.playbackRate !== undefined) {
			settings.player.playbackRate = data.player.playbackRate;
		}

		if (data.player?.autoMarkCompletedThresholdSeconds !== undefined) {
			settings.player.autoMarkCompletedThresholdSeconds =
				data.player.autoMarkCompletedThresholdSeconds;
		}

		if (data.player?.sleepTimerMode !== undefined) {
			settings.player.sleepTimerMode = data.player.sleepTimerMode;
		}

		if (data.library?.showCompleted !== undefined) {
			settings.library.showCompleted = data.library.showCompleted;
		}

		await settings.save();
		return toSettingsDTO(settings);
	}
}
