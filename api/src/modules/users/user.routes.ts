/**
 * Route registration for user profile reads, updates, and related validation.
 * This is where middleware order becomes explicit: auth, role checks,
 * validation, and controller binding are composed here so the external HTTP
 * surface stays readable and reviewable.
 */
import { Router } from "express";

import { UserController } from "./user.controller.js";
import { validateUpdateMyProfileRequest } from "./user.validation.js";

const router = Router();

router.get("/me", UserController.getMe);
router.patch("/me", validateUpdateMyProfileRequest, UserController.updateMe);

export default router;