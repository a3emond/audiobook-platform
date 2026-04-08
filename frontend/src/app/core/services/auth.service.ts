import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { AuthPayload, AuthTokens, OAuthProvider, RegisterPayload, User } from '../models/api.models';
import { ApiService } from './api.service';

interface AuthResponse {
	tokens?: AuthTokens;
	accessToken?: string;
	refreshToken?: string;
	user?: User;
}

interface RefreshResponse {
	accessToken: string;
	refreshToken: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
	private readonly accessTokenState = signal<string | null>(null);
	private readonly refreshTokenState = signal<string | null>(null);
	private readonly userState = signal<User | null>(null);
	private readonly initializedState = signal(false);

	readonly user = this.userState.asReadonly();
	readonly initialized = this.initializedState.asReadonly();
	readonly isAuthenticated = computed(() => !!this.accessTokenState());
	readonly isAdmin = computed(() => this.userState()?.role === 'admin');

	constructor(private readonly api: ApiService) {}

	accessToken(): string | null {
		return this.accessTokenState();
	}

	async init(): Promise<void> {
		this.loadFromStorage();

		if (!this.accessTokenState()) {
			this.initializedState.set(true);
			return;
		}

		try {
			await this.fetchCurrentUser();
		} catch (error) {
			if (
				error instanceof HttpErrorResponse &&
				(error.status === 401 || error.status === 403 || error.status === 404)
			) {
				this.clearSession();
			}
		} finally {
			this.initializedState.set(true);
		}
	}

	async login(payload: AuthPayload): Promise<void> {
		const response = await firstValueFrom(this.api.post<AuthResponse, AuthPayload>('/auth/login', payload));
		this.applyTokens(this.extractTokens(response));
		await this.fetchCurrentUser(response.user ?? null);
	}

	async register(payload: RegisterPayload): Promise<void> {
		const response = await firstValueFrom(this.api.post<AuthResponse, RegisterPayload>('/auth/register', payload));
		this.applyTokens(this.extractTokens(response));
		await this.fetchCurrentUser(response.user ?? null);
	}

	async loginWithOAuth(provider: OAuthProvider, idToken: string): Promise<void> {
		const response = await firstValueFrom(
			this.api.post<AuthResponse, { idToken: string }>(`/auth/oauth/${provider}`, { idToken }),
		);
		this.applyTokens(this.extractTokens(response));
		await this.fetchCurrentUser(response.user ?? null);
	}

	async logout(): Promise<void> {
		try {
			await firstValueFrom(
				this.api.post<unknown, { refreshToken: string | null }>('/auth/logout', {
					refreshToken: this.refreshTokenState(),
				}),
			);
		} catch {
			// Ignore API logout failures and clear local auth state.
		}

		this.clearSession();
	}

	async refresh(): Promise<boolean> {
		const refreshToken = this.refreshTokenState();
		if (!refreshToken) {
			return false;
		}

		try {
			const response = await firstValueFrom(
				this.api.post<RefreshResponse, { refreshToken: string }>('/auth/refresh', {
					refreshToken,
				}),
			);

			this.applyTokens({ accessToken: response.accessToken, refreshToken: response.refreshToken });
			return true;
		} catch {
			this.clearSession();
			return false;
		}
	}

	async reloadCurrentUser(): Promise<void> {
		if (!this.accessTokenState()) {
			return;
		}

		await this.fetchCurrentUser();
	}

	private async fetchCurrentUser(prefetched: User | null = null): Promise<void> {
		if (prefetched) {
			this.userState.set(prefetched);
			return;
		}

		const user = await firstValueFrom(this.api.get<User>('/auth/me'));
		this.userState.set(user);
	}

	private applyTokens(tokens: AuthTokens): void {
		this.accessTokenState.set(tokens.accessToken);
		this.refreshTokenState.set(tokens.refreshToken);
		localStorage.setItem('auth.accessToken', tokens.accessToken);
		localStorage.setItem('auth.refreshToken', tokens.refreshToken);
	}

	private extractTokens(response: AuthResponse): AuthTokens {
		const accessToken = response.tokens?.accessToken ?? response.accessToken;
		const refreshToken = response.tokens?.refreshToken ?? response.refreshToken;

		if (!accessToken || !refreshToken) {
			throw new Error('Auth response did not include tokens');
		}

		return { accessToken, refreshToken };
	}

	private clearSession(): void {
		this.accessTokenState.set(null);
		this.refreshTokenState.set(null);
		this.userState.set(null);
		localStorage.removeItem('auth.accessToken');
		localStorage.removeItem('auth.refreshToken');
	}

	private loadFromStorage(): void {
		const accessToken = localStorage.getItem('auth.accessToken');
		const refreshToken = localStorage.getItem('auth.refreshToken');
		this.accessTokenState.set(accessToken);
		this.refreshTokenState.set(refreshToken);
	}
}
