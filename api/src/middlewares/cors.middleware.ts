import cors from "cors";

import { ApiError } from "../utils/api-error.js";

const DEFAULT_ALLOWED_ORIGINS = [
	"http://localhost:4200",
	"http://127.0.0.1:4200",
];

function parseAllowedOrigins(): string[] {
	const raw = process.env.CORS_ALLOWED_ORIGINS;

	if (!raw) {
		return DEFAULT_ALLOWED_ORIGINS;
	}

	const origins = raw
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);

	return origins.length ? origins : DEFAULT_ALLOWED_ORIGINS;
}

const allowedOrigins = new Set(parseAllowedOrigins());

const corsMiddleware = cors({
	origin(origin, callback) {
		// Allow non-browser clients (curl, server-to-server, postman).
		if (!origin) {
			callback(null, true);
			return;
		}

		if (allowedOrigins.has(origin)) {
			callback(null, true);
			return;
		}

		callback(new ApiError(403, "cors_origin_not_allowed"));
	},
	methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization"],
	credentials: true,
	optionsSuccessStatus: 204,
});

export default corsMiddleware;
