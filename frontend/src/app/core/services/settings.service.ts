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
