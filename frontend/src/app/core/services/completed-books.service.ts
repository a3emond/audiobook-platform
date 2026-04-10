import { Injectable, inject } from '@angular/core';

import { LibraryProgressService } from './library-progress.service';

@Injectable({ providedIn: 'root' })
// completed-books: keeps UI and state logic readable for this frontend unit.
export class CompletedBooksService {
  private readonly libraryProgress = inject(LibraryProgressService);

  isCompleted(bookId: string): boolean {
    return this.libraryProgress.isCompleted(bookId);
  }

  refresh(): void {
    this.libraryProgress.refresh();
  }
}
