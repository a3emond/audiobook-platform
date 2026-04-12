/**
 * Route registration for user settings, playback preferences, and profile customization.
 * This is where middleware order becomes explicit: auth, role checks,
 * validation, and controller binding are composed here so the external HTTP
 * surface stays readable and reviewable.
 */
import { Router } from "express";

import { SettingsController } from "./settings.controller.js";

const router = Router();

router.get("/", SettingsController.getMine);
router.patch("/", SettingsController.updateMine);

export default router;
