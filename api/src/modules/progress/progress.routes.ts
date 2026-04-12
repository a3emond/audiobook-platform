/**
 * Route registration for playback progress persistence and synchronization.
 * This is where middleware order becomes explicit: auth, role checks,
 * validation, and controller binding are composed here so the external HTTP
 * surface stays readable and reviewable.
 */
import { Router } from "express";

import { idempotencyMiddleware } from "../../middlewares/idempotency.middleware.js";
import { ProgressController } from "./progress.controller.js";

const router = Router();

router.get("/", ProgressController.listMine);
router.get("/:bookId", ProgressController.getMine);
router.put("/:bookId", idempotencyMiddleware, ProgressController.saveMine);
router.post("/:bookId/complete", ProgressController.completeMine);
router.delete("/:bookId/complete", ProgressController.uncompleteMine);

export default router;
