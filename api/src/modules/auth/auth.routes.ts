/**
 * Route registration for account authentication, refresh sessions, and OAuth sign-in.
 * This is where middleware order becomes explicit: auth, role checks,
 * validation, and controller binding are composed here so the external HTTP
 * surface stays readable and reviewable.
 */
import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import {
	validateChangeEmailRequest,
	validateChangePasswordRequest,
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
router.post(
	"/change-password",
	authMiddleware,
	validateChangePasswordRequest,
	AuthController.changePassword,
);
router.post(
	"/change-email",
	authMiddleware,
	validateChangeEmailRequest,
	AuthController.changeEmail,
);

export default router;
