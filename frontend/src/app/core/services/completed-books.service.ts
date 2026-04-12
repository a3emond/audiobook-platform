/**
 * ============================================================
 * completed-books.service.ts
 * ============================================================
 *
 * Thin facade over LibraryProgressService that exposes only the
 * completion-related API. Keeps components that only care about
 * completed/not-completed decoupled from the full progress cache.
 *
 * Exported:
 *   CompletedBooksService — root-level injectable
 *
 * Methods:
 *   isCompleted(bookId) — boolean: true when the book is marked completed
 *   refresh()           — trigger a cache refresh on LibraryProgressService
 * ============================================================
 */
import { Injectable, inject } from '@angular/core';

import { LibraryProgressService } from './library-progress.service';

/** Thin facade over LibraryProgressService for completion-only consumers. */
@Injectable({ providedIn: 'root' })
export class CompletedBooksService {
  private readonly libraryProgress = inject(LibraryProgressService);

  isCompleted(bookId: string): boolean {
    return this.libraryProgress.isCompleted(bookId);
  }

  refresh(): void {
    this.libraryProgress.refresh();
  }
}
