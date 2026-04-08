import { Injectable, effect, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { ProgressService } from './progress.service';

@Injectable({ providedIn: 'root' })
export class CompletedBooksService {
  private readonly completedIdsState = signal<Set<string>>(new Set());
  private loading = false;

  constructor(
    private readonly auth: AuthService,
    private readonly progress: ProgressService,
  ) {
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        this.completedIdsState.set(new Set());
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

  isCompleted(bookId: string): boolean {
    return this.completedIdsState().has(bookId);
  }

  refresh(): void {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.progress.listMineAll(100).subscribe({
      next: (items) => {
        const ids = new Set(items.filter((item) => item.completed).map((item) => item.bookId));
        this.completedIdsState.set(ids);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }
}
