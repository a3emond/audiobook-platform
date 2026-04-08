import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import type { ResumeInfo } from '../models/api.models';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class PlayerService {
	constructor(
		private readonly api: ApiService,
		private readonly auth: AuthService,
	) {}

	getResumeInfo(bookId: string): Observable<ResumeInfo> {
		return this.api.get<ResumeInfo>(`/streaming/books/${bookId}/resume`);
	}

	streamUrl(bookId: string): string {
		const token = this.auth.accessToken();
		const base = `/streaming/books/${bookId}/audio`;
		if (!token) {
			return base;
		}

		return `${base}?access_token=${encodeURIComponent(token)}`;
	}
}
