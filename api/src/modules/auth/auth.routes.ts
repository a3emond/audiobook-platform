import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import {
	validateLoginRequest,
	validateLogoutRequest,
	validateOAuthLoginRequest,
	validateRefreshRequest,
	validateRegisterRequest,
} from "./auth.validation.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = Router();

router.post("/register", validateRegisterRequest, AuthController.register);
router.post("/login", validateLoginRequest, AuthController.login);
router.post("/refresh", validateRefreshRequest, AuthController.refresh);
router.post("/logout", validateLogoutRequest, AuthController.logout);

router.post("/oauth/google", validateOAuthLoginRequest, AuthController.google);
router.post("/oauth/apple", validateOAuthLoginRequest, AuthController.apple);

router.get("/me", authMiddleware, AuthController.me);

export default router;
