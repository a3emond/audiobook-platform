import { UserDTO } from './user.dto.js';
import { IdDTO, TimestampDTO } from './common.dto.js';
// ----------------------
// Auth
// ----------------------

export interface LoginDTO {
  email: string;
  password: string;
}

export interface RegisterDTO {
  email: string;
  password: string;
  displayName?: string;
}

export interface RefreshDTO {
  refreshToken: string;
}

export interface LogoutDTO {
  refreshToken: string;
}

export interface OAuthLoginDTO {
  idToken: string;
}

export interface ChangePasswordDTO {
  currentPassword: string;
  newPassword: string;
}

export interface ChangeEmailDTO {
  currentPassword: string;
  newEmail: string;
}

/**
 * Tokens
 */
export interface AuthTokensDTO {
  accessToken: string;
  refreshToken: string;
}

/**
 * Login / OAuth response
 */
export interface AuthResponseDTO {
  tokens: AuthTokensDTO;
  user: UserDTO;
}

/**
 * Refresh response
 */
export type RefreshResponseDTO = AuthTokensDTO;

/**
 * Auth session (optional exposure / admin)
 */
export interface AuthSessionDTO extends IdDTO, TimestampDTO {
  userId: string;
  device?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  expiresAt: string;
  lastUsedAt: string;
}