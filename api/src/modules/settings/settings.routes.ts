import { Router } from "express";

import { SettingsController } from "./settings.controller.js";

const router = Router();

router.get("/", SettingsController.getMine);
router.patch("/", SettingsController.updateMine);

export default router;
