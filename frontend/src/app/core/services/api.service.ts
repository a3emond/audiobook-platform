import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface ApiRequestOptions {
	params?: Record<string, string | number | boolean | undefined | null>;
	headers?: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
	private readonly http = inject(HttpClient);
	private readonly baseUrl = this.resolveBaseUrl();

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

	createEventSource(path: string, params?: Record<string, string>): EventSource {
		const query = params ? new URLSearchParams(params).toString() : '';
		const suffix = query ? `?${query}` : '';
		return new EventSource(`${this.url(path)}${suffix}`, { withCredentials: false });
	}

	private url(path: string): string {
		if (path.startsWith('/streaming/')) {
			return path;
		}

		const cleanPath = path.startsWith('/') ? path : `/${path}`;
		return `${this.baseUrl}${cleanPath}`;
	}

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

	private resolveBaseUrl(): string {
		const hostOverride = (globalThis as { __API_BASE_URL__?: string }).__API_BASE_URL__;
		if (hostOverride && hostOverride.trim()) {
			return hostOverride.replace(/\/$/, '');
		}
		return '/api/v1';
	}
}
