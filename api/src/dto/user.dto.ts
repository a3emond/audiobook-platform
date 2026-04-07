import { IdDTO, PaginationMetaDTO, TimestampDTO } from "./common.dto.js";


export interface UserDTO extends IdDTO, TimestampDTO {
  email: string;
  role: "admin" | "user";
  profile: {
    displayName?: string | null;
    preferredLocale: "fr" | "en";
  };
}

export interface UpdateMyProfileDTO {
  profile?: {
    displayName?: string | null;
    preferredLocale?: "fr" | "en";
  };
}

export interface AdminListUsersQueryDTO {
  q?: string;
  role?: "admin" | "user";
  limit?: number;
  offset?: number;
}

export interface AdminListUsersResponseDTO extends PaginationMetaDTO {
  users: UserDTO[];
  total: number;
}

export interface AdminUpdateUserRoleDTO {
  role: "admin" | "user";
}

export interface AdminUserSessionDTO extends IdDTO, TimestampDTO {
  userId: string;
  device?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  expiresAt: string;
  lastUsedAt: string;
}

export interface AdminListUserSessionsResponseDTO extends PaginationMetaDTO {
  sessions: AdminUserSessionDTO[];
  total: number;
}

export interface AdminRevokeSessionsResponseDTO {
  revoked: number;
}
