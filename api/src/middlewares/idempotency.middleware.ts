/**
 * Prevents duplicate processing of retried write requests that carry an
 * Idempotency-Key header. In this audiobook platform, clients may retry
 * uploads, progress writes, or admin actions after flaky mobile/network
 * failures; this middleware makes those retries safe by replaying the first
 * successful JSON response for the same user + method + path + key instead of
 * executing the side effect twice.
 */
import crypto from "node:crypto";
import { type Request, type Response, type NextFunction } from "express";

import { ApiError } from "../utils/api-error.js";

interface IdempotencyRecord {
	statusCode: number;
	body: unknown;
	bodyHash: string;
	expiresAt: number;
	inFlight: boolean;
}

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const idempotencyStore = new Map<string, IdempotencyRecord>();

function hashBody(body: unknown): string {
	return crypto
		.createHash("sha256")
		.update(JSON.stringify(body ?? {}))
		.digest("hex");
}

function buildStoreKey(req: Request, key: string): string {
	const userPart = (req as Request & { user?: { id?: string } }).user?.id ?? "anon";
	return `${userPart}:${req.method}:${req.path}:${key}`;
}

export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
	const headerKey = req.header("Idempotency-Key");
	if (!headerKey) {
		next();
		return;
	}

	if (headerKey.length > 200) {
		throw new ApiError(400, "idempotency_key_too_long");
	}

	const now = Date.now();
	const bodyHash = hashBody(req.body);
	const storeKey = buildStoreKey(req, headerKey);
	const existing = idempotencyStore.get(storeKey);

	if (existing && existing.expiresAt > now) {
		if (existing.bodyHash !== bodyHash) {
			throw new ApiError(409, "idempotency_key_reused_with_different_payload");
		}

		if (existing.inFlight) {
			throw new ApiError(409, "idempotency_request_in_progress");
		}

		res.status(existing.statusCode).setHeader("Idempotent-Replayed", "true").json(existing.body);
		return;
	}

	idempotencyStore.set(storeKey, {
		statusCode: 202,
		body: { message: "processing" },
		bodyHash,
		expiresAt: now + IDEMPOTENCY_TTL_MS,
		inFlight: true,
	});

	const originalJson = res.json.bind(res);
	res.json = ((body: unknown) => {
		idempotencyStore.set(storeKey, {
			statusCode: res.statusCode,
			body,
			bodyHash,
			expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
			inFlight: false,
		});

		return originalJson(body);
	}) as typeof res.json;

	next();
}