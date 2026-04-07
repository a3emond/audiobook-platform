import { Router } from "express";

import { UserController } from "./user.controller.js";
import { validateUpdateMyProfileRequest } from "./user.validation.js";

const router = Router();

router.get("/me", UserController.getMe);
router.patch("/me", validateUpdateMyProfileRequest, UserController.updateMe);

export default router;