import { Router } from "express";

import { idempotencyMiddleware } from "../../middlewares/idempotency.middleware.js";
import { StatsController } from "./stats.controller.js";
import { validateCreateSessionRequest } from "./stats.validation.js";

const router = Router();

router.get("/me", StatsController.getMine);
router.get("/sessions", StatsController.listMySessions);
router.post(
	"/sessions",
	idempotencyMiddleware,
	validateCreateSessionRequest,
	StatsController.createMySession,
);

export default router;
