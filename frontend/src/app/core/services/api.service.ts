/**
 * ============================================================
 * api.service.ts
 * ============================================================
 *
 * Central HTTP service for all API calls in the frontend.
 * Resolves the base URL from the runtime env.js override, normalises
 * query parameters, and exposes typed wrappers around HttpClient.
 *
 * Exported:
 *   ApiService          — root-level injectable; injected by domain services
 *   ApiRequestOptions   — optional params / headers for any request
 *
 * Methods:
 *   get<T>(path, opts?)              — HTTP GET
 *   post<T,B>(path, body, opts?)     — HTTP POST (JSON)
 *   patch<T,B>(path, body, opts?)    — HTTP PATCH (JSON)
 *   put<T,B>(path, body, opts?)      — HTTP PUT (JSON)
 *   delete<T>(path, opts?)           — HTTP DELETE
 *   postFormData<T>(path, form, opts?) — HTTP POST (multipart/form-data)
 *   createEventSource(path, params?) — SSE EventSource for admin log streams
 * ============================================================
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface ApiRequestOptions {
	params?: Record<string, string | number | boolean | undefined | null>;
	headers?: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
// ApiService centralizes URL resolution and request option normalization so the
// domain services can stay close to backend route names.
export class ApiService {
	private readonly http = inject(HttpClient);
	private readonly baseUrl = this.resolveBaseUrl();

	// Basic verbs intentionally stay thin wrappers around HttpClient.
	get<T>(path: string, options: ApiRequestOptions = {}): Observable<T> {
		return this.http.get<T>(this.url(path), {
			params: this.buildParams(options.params),
			headers: options.headers,
		});
	}

	post<T, B = unknown>(path: string, body: B, options: ApiRequestOptions = {}): Observable<T> {
		return this.http.post<T>(this.url(path), body, {
			params: this.buildParams(options.params),
			headers: options.headers,
		});
	}

	patch<T, B = unknown>(path: string, body: B, options: ApiRequestOptions = {}): Observable<T> {
		return this.http.patch<T>(this.url(path), body, {
			params: this.buildParams(options.params),
			headers: options.headers,
		});
	}

	put<T, B = unknown>(path: string, body: B, options: ApiRequestOptions = {}): Observable<T> {
		return this.http.put<T>(this.url(path), body, {
			params: this.buildParams(options.params),
			headers: options.headers,
		});
	}

	delete<T>(path: string, options: ApiRequestOptions = {}): Observable<T> {
		return this.http.delete<T>(this.url(path), {
			params: this.buildParams(options.params),
			headers: options.headers,
		});
	}

	postFormData<T>(path: string, formData: FormData, options: ApiRequestOptions = {}): Observable<T> {
		return this.http.post<T>(this.url(path), formData, {
			params: this.buildParams(options.params),
			headers: options.headers,
		});
	}

	// SSE is used for long-running admin streams where standard polling is wasteful.
	createEventSource(path: string, params?: Record<string, string>): EventSource {
		const query = params ? new URLSearchParams(params).toString() : '';
		const suffix = query ? `?${query}` : '';
		return new EventSource(`${this.url(path)}${suffix}`, { withCredentials: false });
	}

	// Streaming assets already expose their own paths and should not be double-prefixed.
	private url(path: string): string {
		if (path.startsWith('/streaming/')) {
			return path;
		}

		const cleanPath = path.startsWith('/') ? path : `/${path}`;
		return `${this.baseUrl}${cleanPath}`;
	}

	// Empty-like values are dropped so callers do not have to sanitize filter objects manually.
	private buildParams(params?: ApiRequestOptions['params']): HttpParams | undefined {
		if (!params) {
			return undefined;
		}

		let httpParams = new HttpParams();
		for (const [key, value] of Object.entries(params)) {
			if (value === undefined || value === null || value === '') {
				continue;
			}
			httpParams = httpParams.set(key, String(value));
		}
		return httpParams;
	}

	// env.js can override the API host at runtime, which keeps Docker and static builds simple.
	private resolveBaseUrl(): string {
		const hostOverride = (globalThis as { __API_BASE_URL__?: string }).__API_BASE_URL__;
		if (hostOverride && hostOverride.trim()) {
			return hostOverride.replace(/\/$/, '');
		}
		return '/api/v1';
	}
}
