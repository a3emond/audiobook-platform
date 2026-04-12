/**
 * ============================================================
 * library-progress.service.ts
 * ============================================================
 *
 * Client-side cache of per-book progress. Refreshes automatically
 * when the user logs in or when ProgressService emits progressChanged$.
 * Provides synchronous accessors used by list and detail components
 * during rendering without additional API calls.
 *
 * Exported:
 *   LibraryProgressService  — root-level injectable
 *   AggregateProgress       — combined progress summary for a set of books
 *
 * Methods:
 *   progressForBook(bookId)          — Progress | null: raw cache lookup
 *   isCompleted(bookId)              — boolean
 *   progressPercentForBook(book)     — number | null (0–100) by book duration
 *   progressPercentByBookId(bookId)  — number | null (0–100) from cache only
 *   progressRatioForBook(book)       — number 0–1 fraction
 *   listenedSecondsForBook(book)     — number: clamped listened seconds
 *   aggregateProgressForBooks(books) — AggregateProgress for a set of books
 *   refresh()                        — force a cache reload from /progress
 * ============================================================
 */
import { Injectable, effect, signal } from '@angular/core';

import type { Book, Progress } from '../models/api.models';
import { AuthService } from './auth.service';
import { ProgressService } from './progress.service';

export interface AggregateProgress {
  ratio: number;
  percent: number;
  listenedSeconds: number;
  totalSeconds: number;
}

// Shared clamp helper keeps progress math consistent across list/detail views.
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Client-side cache of per-book progress. Refreshes on login and on
 * ProgressService.progressChanged$ events. Provides synchronous accessors.
 */
@Injectable({ providedIn: 'root' })
export class LibraryProgressService {
  private readonly progressByBookIdState = signal<Map<string, Progress>>(new Map());
  private loading = false;
  private pendingRefresh = false;

  constructor(
    private readonly auth: AuthService,
    private readonly progress: ProgressService,
  ) {
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        this.progressByBookIdState.set(new Map());
        return;
      }

      this.refresh();
    });

    this.progress.progressChanged$.subscribe(() => {
      if (this.auth.isAuthenticated()) {
        this.refresh();
      }
    });
  }

  // Read helpers are synchronous because components call them frequently during rendering.
  progressForBook(bookId: string): Progress | null {
    return this.progressByBookIdState().get(bookId) ?? null;
  }

  isCompleted(bookId: string): boolean {
    return this.progressForBook(bookId)?.completed === true;
  }

  progressPercentForBook(book: Pick<Book, 'id' | 'duration'>): number | null {
    const ratio = this.progressRatioForBook(book);
    if (ratio <= 0) {
      return null;
    }

    return Math.round(ratio * 100);
  }

  progressPercentByBookId(bookId: string): number | null {
    const progress = this.progressForBook(bookId);
    if (!progress) {
      return null;
    }

    if (progress.completed) {
      return 100;
    }

    const totalSeconds = this.resolveDurationSeconds(0, progress.durationAtSave);
    if (totalSeconds <= 0) {
      return null;
    }

    const percent = Math.round(clamp(progress.positionSeconds / totalSeconds, 0, 0.999) * 100);
    return percent > 0 ? percent : null;
  }

  progressRatioForBook(book: Pick<Book, 'id' | 'duration'>): number {
    const progress = this.progressForBook(book.id);
    if (!progress) {
      return 0;
    }

    if (progress.completed) {
      return 1;
    }

    const totalSeconds = this.resolveDurationSeconds(book.duration, progress.durationAtSave);
    if (totalSeconds <= 0) {
      return 0;
    }

    return clamp(progress.positionSeconds / totalSeconds, 0, 0.999);
  }

  listenedSecondsForBook(book: Pick<Book, 'id' | 'duration'>): number {
    const progress = this.progressForBook(book.id);
    if (!progress) {
      return 0;
    }

    const totalSeconds = this.resolveDurationSeconds(book.duration, progress.durationAtSave);
    if (totalSeconds <= 0) {
      return 0;
    }

    if (progress.completed) {
      return totalSeconds;
    }

    return clamp(progress.positionSeconds, 0, totalSeconds);
  }

  aggregateProgressForBooks(books: Array<Pick<Book, 'id' | 'duration'>>): AggregateProgress {
    const totals = books.reduce(
      (acc, book) => {
        const progress = this.progressForBook(book.id);
        const totalSeconds = this.resolveDurationSeconds(book.duration, progress?.durationAtSave ?? 0);

        if (totalSeconds <= 0) {
          return acc;
        }

        acc.totalSeconds += totalSeconds;
        acc.listenedSeconds += this.listenedSecondsForBook(book);
        return acc;
      },
      { listenedSeconds: 0, totalSeconds: 0 },
    );

    const ratio = totals.totalSeconds > 0 ? clamp(totals.listenedSeconds / totals.totalSeconds, 0, 1) : 0;

    return {
      ratio,
      percent: Math.round(ratio * 100),
      listenedSeconds: totals.listenedSeconds,
      totalSeconds: totals.totalSeconds,
    };
  }

  // Refresh collapses concurrent requests into one extra rerun instead of overlapping fetches.
  refresh(): void {
    if (this.loading) {
      this.pendingRefresh = true;
      return;
    }

    this.loading = true;
    this.progress.listMineAll(100).subscribe({
      next: (items) => {
        this.progressByBookIdState.set(new Map(items.map((item) => [item.bookId, item])));
        this.loading = false;

        if (this.pendingRefresh) {
          this.pendingRefresh = false;
          this.refresh();
        }
      },
      error: () => {
        this.loading = false;

        if (this.pendingRefresh) {
          this.pendingRefresh = false;
          this.refresh();
        }
      },
    });
  }

  // Book duration can come from catalog metadata or from the last persisted player snapshot.
  private resolveDurationSeconds(bookDuration: number | undefined, durationAtSave: number): number {
    const candidate = Number.isFinite(bookDuration) && (bookDuration ?? 0) > 0
      ? Number(bookDuration)
      : durationAtSave;

    return Number.isFinite(candidate) && candidate > 0 ? candidate : 0;
  }
}