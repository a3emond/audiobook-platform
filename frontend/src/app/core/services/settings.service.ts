/**
 * ============================================================
 * settings.service.ts
 * ============================================================
 *
 * Wraps user-facing account and settings endpoints: player
 * preferences, profile display name, and credential changes.
 *
 * Exported:
 *   SettingsService — root-level injectable
 *
 * Methods:
 *   getMine()                  — GET /settings → Observable<UserSettings>
 *   updateMine(payload)        — PATCH /settings → Observable<UserSettings>
 *   getMyProfile()             — GET /users/me → Observable<User>
 *   updateMyProfile(payload)   — PATCH /users/me → Observable<User>
 *   changePassword(payload)    — POST /auth/change-password
 *   changeEmail(payload)       — POST /auth/change-email
 * ============================================================
 */
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import type {
	ChangeEmailPayload,
	ChangePasswordPayload,
	UpdateSettingsPayload,
	User,
	UserSettings,
} from '../models/api.models';
import { ApiService } from './api.service';

/** Wraps user-facing account and settings endpoints. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
	constructor(private readonly api: ApiService) {}

	getMine(): Observable<UserSettings> {
		return this.api.get<UserSettings>('/settings');
	}

	updateMine(payload: UpdateSettingsPayload): Observable<UserSettings> {
		return this.api.patch<UserSettings, UpdateSettingsPayload>('/settings', payload);
	}

	getMyProfile(): Observable<User> {
		return this.api.get<User>('/users/me');
	}

	updateMyProfile(payload: { profile: { displayName?: string | null; preferredLocale?: 'fr' | 'en' } }): Observable<User> {
		return this.api.patch<User, { profile: { displayName?: string | null; preferredLocale?: 'fr' | 'en' } }>('/users/me', payload);
	}

	changePassword(payload: ChangePasswordPayload): Observable<{ success: true }> {
		return this.api.post<{ success: true }, ChangePasswordPayload>('/auth/change-password', payload);
	}

	changeEmail(payload: ChangeEmailPayload): Observable<User> {
		return this.api.post<User, ChangeEmailPayload>('/auth/change-email', payload);
	}
}
