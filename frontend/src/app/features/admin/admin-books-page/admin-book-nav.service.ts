import { Injectable, signal } from '@angular/core';
import type { Params } from '@angular/router';

// Remembers the books table's current result order and query so the edit page
// can offer prev/next and "back to list" without losing filters.
@Injectable({ providedIn: 'root' })
export class AdminBookNavService {
  readonly bookIds = signal<string[]>([]);
  readonly listQuery = signal<Params>({});

  remember(bookIds: string[], listQuery: Params): void {
    this.bookIds.set(bookIds);
    this.listQuery.set(listQuery);
  }

  neighbours(bookId: string): { prev: string | null; next: string | null; position: number; total: number } {
    const ids = this.bookIds();
    const index = ids.indexOf(bookId);
    if (index < 0) {
      return { prev: null, next: null, position: 0, total: 0 };
    }

    return {
      prev: index > 0 ? ids[index - 1] : null,
      next: index < ids.length - 1 ? ids[index + 1] : null,
      position: index + 1,
      total: ids.length,
    };
  }
}
