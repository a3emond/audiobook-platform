import { CommonModule } from '@angular/common';
import { Component, HostListener, effect, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';

import type { Book, Progress } from './core/models/api.models';
import { AuthService } from './core/services/auth.service';
import { CompletedBooksService } from './core/services/completed-books.service';
import { LibraryService } from './core/services/library.service';
import { ProgressService } from './core/services/progress.service';

interface InProgressBookItem {
  book: Book;
  progress: Progress;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly adminMenuOpen  = signal(false);
  readonly mobileNavOpen  = signal(false);
  readonly inProgressBooks = signal<InProgressBookItem[]>([]);
  private progressChangedSub?: Subscription;

  constructor(
    protected readonly auth: AuthService,
    private readonly router: Router,
    private readonly progressService: ProgressService,
    private readonly libraryService: LibraryService,
    private readonly completedBooks: CompletedBooksService,
  ) {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.loadInProgressBooks();
        return;
      }

      this.inProgressBooks.set([]);
    });

    this.progressChangedSub = this.progressService.progressChanged$.subscribe(() => {
      if (this.auth.isAuthenticated()) {
        this.loadInProgressBooks();
      }
    });
  }

  isAdminRouteActive(): boolean {
    return this.router.url.startsWith('/admin');
  }

  toggleAdminMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.adminMenuOpen.update(open => !open);
  }

  closeAdminMenu(): void {
    this.adminMenuOpen.set(false);
  }

  toggleMobileNav(): void {
    this.mobileNavOpen.update(open => !open);
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
    this.adminMenuOpen.set(false);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.adminMenuOpen.set(false);
  }

  async logout(): Promise<void> {
    this.closeMobileNav();
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  coverUrl(book: Book): string {
    if (!book.coverPath) {
      return '';
    }

    const token = this.auth.accessToken();
    if (!token) {
      return '';
    }

    return `/streaming/books/${book.id}/cover?access_token=${encodeURIComponent(token)}`;
  }

  coverInitials(book: Book): string {
    const initials = (book.title ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');

    return initials || 'BK';
  }

  isBookCompleted(bookId: string): boolean {
    return this.completedBooks.isCompleted(bookId);
  }

  private loadInProgressBooks(): void {
    this.progressService.listMine(40, 0).subscribe({
      next: (progressResponse) => {
        const progressItems = [...progressResponse.progress]
          .filter((progress) => !progress.completed && progress.positionSeconds > 0)
          .sort((a, b) => {
            const aTime = a.lastListenedAt ? Date.parse(a.lastListenedAt) : 0;
            const bTime = b.lastListenedAt ? Date.parse(b.lastListenedAt) : 0;
            return bTime - aTime;
          });

        if (progressItems.length === 0) {
          this.inProgressBooks.set([]);
          return;
        }

        this.libraryService.listBooks({ limit: 200, offset: 0 }).subscribe({
          next: (booksResponse) => {
            const byId = new Map(booksResponse.books.map((book) => [book.id, book]));
            const merged = progressItems
              .map((progress) => {
                const book = byId.get(progress.bookId);
                if (!book) {
                  return null;
                }

                return { book, progress };
              })
              .filter((item): item is InProgressBookItem => item !== null)
              .slice(0, 24);

            this.inProgressBooks.set(merged);
          },
          error: () => {
            this.inProgressBooks.set([]);
          },
        });
      },
      error: () => {
        this.inProgressBooks.set([]);
      },
    });
  }
}
