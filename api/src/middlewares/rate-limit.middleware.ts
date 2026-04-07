import { type Request, type Response, type NextFunction } from "express";

import { ApiError } from "../utils/api-error.js";

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

interface RateLimitConfig {
	windowMs: number;
	max: number;
	keyPrefix: string;
}

const store = new Map<string, RateLimitEntry>();

function getClientKey(req: Request): string {
	const ip = req.ip || req.socket.remoteAddress || "unknown";
	return ip;
}

export function createRateLimiter(config: RateLimitConfig) {
	return (req: Request, _res: Response, next: NextFunction) => {
		const now = Date.now();
		const key = `${config.keyPrefix}:${getClientKey(req)}`;
		const current = store.get(key);

		if (!current || current.resetAt <= now) {
			store.set(key, {
				count: 1,
				resetAt: now + config.windowMs,
			});
			next();
			return;
		}

		if (current.count >= config.max) {
			throw new ApiError(429, "rate_limit_exceeded");
		}

		current.count += 1;
		store.set(key, current);
		next();
	};
}

export const globalRateLimiter = createRateLimiter({
	windowMs: 60 * 1000,
	max: 300,
	keyPrefix: "global",
});

export const authAbuseRateLimiter = createRateLimiter({
	windowMs: 15 * 60 * 1000,
	max: 20,
	keyPrefix: "auth",
});