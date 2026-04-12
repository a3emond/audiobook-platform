/**
 * HTTP controller for account authentication, refresh sessions, and OAuth sign-in.
 * Controllers in this API are intentionally thin: they translate Express
 * request data into validated service inputs and choose response status codes,
 * while the real business rules live below in the service/model layer.
 */
import { Request, Response } from "express";

import { AuthService } from "./auth.service.js";
import { OAuthService } from "./oauth.service.js";
import { type AuthenticatedRequest } from "../../middlewares/auth.middleware.js";

import type {
  ChangeEmailDTO,
  ChangePasswordDTO,
  LoginDTO,
  LogoutDTO,
  OAuthLoginDTO,
  RefreshDTO,
  RegisterDTO,
} from "../../dto/auth.dto.js";

export class AuthController {
  private static resolvePreferredLocale(
    explicit: unknown,
    acceptLanguageHeader: string | undefined,
  ): "fr" | "en" {
    if (explicit === "fr" || explicit === "en") {
      return explicit;
    }

    if (acceptLanguageHeader?.toLowerCase().startsWith("fr")) {
      return "fr";
    }

    return "en";
  }

  static async register(
    req: Request<unknown, unknown, RegisterDTO>,
    res: Response,
  ) {
    const { email, password, displayName, preferredLocale } = req.body;

    const result = await AuthService.register(
      email,
      password,
      displayName,
      AuthController.resolvePreferredLocale(preferredLocale, req.headers["accept-language"]),
    );

    res.status(201).json(result);
  }

  static async login(req: Request<unknown, unknown, LoginDTO>, res: Response) {
    const { email, password } = req.body;

    const result = await AuthService.login(email, password);

    res.status(200).json(result);
  }

  static async refresh(
    req: Request<unknown, unknown, RefreshDTO>,
    res: Response,
  ) {
    const { refreshToken } = req.body;

    const result = await AuthService.refresh(refreshToken);

    res.status(200).json(result);
  }

  static async logout(
    req: Request<unknown, unknown, LogoutDTO>,
    res: Response,
  ) {
    const { refreshToken } = req.body;

    await AuthService.logout(refreshToken);

    res.status(200).json({ success: true });
  }

  static async google(
    req: Request<unknown, unknown, OAuthLoginDTO>,
    res: Response,
  ) {
    const { idToken } = req.body;

    const profile = await OAuthService.verifyGoogle(idToken);
    const result = await AuthService.loginWithOAuth(
      profile,
      AuthController.resolvePreferredLocale(undefined, req.headers["accept-language"]),
    );

    res.status(200).json(result);
  }

  static async apple(
    req: Request<unknown, unknown, OAuthLoginDTO>,
    res: Response,
  ) {
    const { idToken } = req.body;

    const profile = await OAuthService.verifyApple(idToken);
    const result = await AuthService.loginWithOAuth(
      profile,
      AuthController.resolvePreferredLocale(undefined, req.headers["accept-language"]),
    );

    res.status(200).json(result);
  }

  static async me(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.id as string;

    const user = await AuthService.getCurrentUser(userId);

    res.status(200).json(user);
  }

  static async changePassword(
    req: AuthenticatedRequest,
    res: Response,
  ) {
    const userId = req.user?.id as string;
    const { currentPassword, newPassword } = req.body as ChangePasswordDTO;

    await AuthService.changePassword(userId, currentPassword, newPassword);

    res.status(200).json({ success: true });
  }

  static async changeEmail(
    req: AuthenticatedRequest,
    res: Response,
  ) {
    const userId = req.user?.id as string;
    const { currentPassword, newEmail } = req.body as ChangeEmailDTO;

    const user = await AuthService.changeEmail(userId, currentPassword, newEmail);

    res.status(200).json(user);
  }
}
