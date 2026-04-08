import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import type {
  CreateListeningSessionPayload,
  ListListeningSessionsResponse,
} from '../models/api.models';
import { ApiService } from './api.service';

export interface UserStatsResponse {
  lifetime: {
    totalListeningSeconds: number;
    completedBooksCount: number;
    distinctBooksStarted: number;
    distinctBooksCompleted: number;
    totalSessions: number;
    totalSeekCount: number;
    totalForwardJumps: number;
    totalBackwardJumps: number;
    lastListeningAt: string | null;
  };
  rolling: {
    last7DaysListeningSeconds: number;
    last30DaysListeningSeconds: number;
  };
}

@Injectable({ providedIn: 'root' })
export class StatsService {
	constructor(private readonly api: ApiService) {}

	getMine(): Observable<UserStatsResponse> {
		return this.api.get<UserStatsResponse>('/stats/me');
	}

	listSessions(query: { bookId?: string; limit?: number; offset?: number } = {}): Observable<ListListeningSessionsResponse> {
		return this.api.get<ListListeningSessionsResponse>('/stats/sessions', {
			params: {
				bookId: query.bookId,
				limit: query.limit,
				offset: query.offset,
			},
		});
	}

	createSession(payload: CreateListeningSessionPayload, idempotencyKey: string): Observable<{ id: string }> {
		return this.api.post<{ id: string }, CreateListeningSessionPayload>('/stats/sessions', payload, {
			headers: { 'Idempotency-Key': idempotencyKey },
		});
	}
}
