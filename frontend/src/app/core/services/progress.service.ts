import { Injectable } from '@angular/core';
import { EMPTY, Observable, Subject, expand, map, reduce, tap } from 'rxjs';

import type { PaginationMeta, Progress } from '../models/api.models';
import { ApiService } from './api.service';

interface SaveProgressPayload {
	positionSeconds: number;
	durationAtSave: number;
	lastChapterIndex?: number;
	secondsIntoChapter?: number;
}

interface ListProgressResponse extends PaginationMeta {
	progress: Progress[];
}

@Injectable({ providedIn: 'root' })
// ProgressService wraps reading/writing listening progress and emits a simple
// invalidation signal for any UI that caches progress-derived state.
export class ProgressService {
	private readonly progressChangedSubject = new Subject<void>();
	readonly progressChanged$ = this.progressChangedSubject.asObservable();

	constructor(private readonly api: ApiService) {}

	// Basic read operations.
	listMine(limit = 20, offset = 0): Observable<ListProgressResponse> {
		return this.api.get<ListProgressResponse>('/progress', { params: { limit, offset } });
	}

	// listMineAll is intentionally iterative so callers do not have to reason about pagination.
	listMineAll(limit = 100): Observable<Progress[]> {
		const pageSize = Math.min(100, Math.max(1, Math.floor(limit)));

		return this.listMine(pageSize, 0).pipe(
			expand((response) => (response.hasMore ? this.listMine(pageSize, response.offset + response.limit) : EMPTY)),
			map((response) => response.progress),
			reduce((all, batch) => all.concat(batch), [] as Progress[]),
		);
	}

	getForBook(bookId: string): Observable<Progress> {
		return this.api.get<Progress>(`/progress/${bookId}`);
	}

	// Any write emits progressChanged$ so library views can refresh without tight coupling.
	saveForBook(bookId: string, payload: SaveProgressPayload, idempotencyKey: string): Observable<Progress> {
		return this.api
			.put<Progress, SaveProgressPayload>(`/progress/${bookId}`, payload, {
				headers: { 'Idempotency-Key': idempotencyKey },
			})
			.pipe(tap(() => this.progressChangedSubject.next()));
	}

	markCompleted(bookId: string): Observable<Progress> {
		return this.api
			.post<Progress, { manual: boolean }>(`/progress/${bookId}/complete`, { manual: true })
			.pipe(tap(() => this.progressChangedSubject.next()));
	}

	unmarkCompleted(bookId: string): Observable<Progress> {
		return this.api.delete<Progress>(`/progress/${bookId}/complete`).pipe(tap(() => this.progressChangedSubject.next()));
	}
}
