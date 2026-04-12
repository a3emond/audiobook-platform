/**
 * ============================================================
 * stats.service.ts
 * ============================================================
 *
 * Wraps listening-analytics endpoints used by the profile page and
 * the player's automatic session-flush logic.
 *
 * Exported:
 *   StatsService        — root-level injectable
 *   UserStatsResponse   — shape of the /stats/me response
 *
 * Methods:
 *   getMine()                       — Observable<UserStatsResponse>: lifetime + rolling stats
 *   listSessions(query?)            — Observable<ListListeningSessionsResponse>
 *   createSession(payload, key)     — Observable<{id}> with idempotency key
 * ============================================================
 */
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
// StatsService wraps listening analytics endpoints used by profile and player flows.
export class StatsService {
	constructor(private readonly api: ApiService) {}

	// Aggregate user-facing stats.
	getMine(): Observable<UserStatsResponse> {
		return this.api.get<UserStatsResponse>('/stats/me');
	}

	// Session lists stay paginated because they can become large for active users.
	listSessions(query: { bookId?: string; limit?: number; offset?: number } = {}): Observable<ListListeningSessionsResponse> {
		return this.api.get<ListListeningSessionsResponse>('/stats/sessions', {
			params: {
				bookId: query.bookId,
				limit: query.limit,
				offset: query.offset,
			},
		});
	}

	// PlayerService uses an idempotency key here so pause/end retries do not double-count sessions.
	createSession(payload: CreateListeningSessionPayload, idempotencyKey: string): Observable<{ id: string }> {
		return this.api.post<{ id: string }, CreateListeningSessionPayload>('/stats/sessions', payload, {
			headers: { 'Idempotency-Key': idempotencyKey },
		});
	}
}
