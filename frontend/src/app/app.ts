import { CommonModule } from '@angular/common';
import { Component, OnDestroy, effect, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Subscription } from 'rxjs';

import type { Book, Progress } from './core/models/api.models';
import { AuthService } from './core/services/auth.service';
import { LibraryProgressService } from './core/services/library-progress.service';
import { LibraryService } from './core/services/library.service';
import { ProgressService } from './core/services/progress.service';
import { SettingsService } from './core/services/settings.service';
import { I18nService } from './core/services/i18n.service';
import { RealtimeService } from './core/services/realtime.service';
import { CoverTileComponent } from './shared/ui/cover-tile/cover-tile.component';

interface InProgressBookItem {
  book: Book;
  progress: Progress;
}

interface ToastItem {
  id: string;
  text: string;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, CoverTileComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  readonly mobileNavOpen  = signal(false);
  readonly inProgressBooks = signal<InProgressBookItem[]>([]);
  readonly notifications = signal<ToastItem[]>([]);
  private progressChangedSub?: Subscription;
  private realtimeSub?: Subscription;

  constructor(
    protected readonly auth: AuthService,
    private readonly router: Router,
    private readonly progressService: ProgressService,
    private readonly libraryService: LibraryService,
    private readonly libraryProgress: LibraryProgressService,
    private readonly settingsService: SettingsService,
    protected readonly i18n: I18nService,
    private readonly realtime: RealtimeService,
  ) {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.loadInProgressBooks();
        return;
      }

      this.inProgressBooks.set([]);
    });

    effect(() => {
      const locale = this.auth.user()?.profile.preferredLocale;
      if (locale === 'en' || locale === 'fr') {
        void this.i18n.setLocale(locale);
      }
    });

    this.progressChangedSub = this.progressService.progressChanged$.subscribe(() => {
      if (this.auth.isAuthenticated()) {
        this.loadInProgressBooks();
      }
    });

    this.realtime.connect();
    this.realtimeSub = this.realtime
      .on<{ book?: { title?: string } }>('catalog.book.added')
      .subscribe((payload) => {
        const title = payload.book?.title || this.i18n.t('common.unknownTitle');
        this.pushNotification(`${this.i18n.t('toast.newBook')}: ${title}`);
      });
  }

  ngOnDestroy(): void {
    this.progressChangedSub?.unsubscribe();
    this.realtimeSub?.unsubscribe();
  }

  toggleMobileNav(): void {
    this.mobileNavOpen.update(open => !open);
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }

  async logout(): Promise<void> {
    this.closeMobileNav();
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  t(key: string): string {
    return this.i18n.t(key);
  }

  discussionsLink(): string[] {
    return ['/discussions', this.i18n.locale()];
  }

  async switchLocale(locale: 'en' | 'fr'): Promise<void> {
    if (this.i18n.locale() === locale) {
      return;
    }

    await this.i18n.setLocale(locale);

    if (!this.auth.isAuthenticated()) {
      return;
    }

    try {
      await Promise.all([
        firstValueFrom(this.settingsService.updateMyProfile({
          profile: {
            preferredLocale: locale,
          },
        })),
        firstValueFrom(this.settingsService.updateMine({ locale })),
      ]);

      await this.auth.reloadCurrentUser();
      this.loadInProgressBooks();
    } catch {
      // Keep the local choice even if persistence fails.
    }
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
    return this.libraryProgress.isCompleted(bookId);
  }

  bookProgressPercent(book: Book): number | null {
    return this.libraryProgress.progressPercentForBook(book);
  }

  progressTooltip(book: Book): string {
    if (this.isBookCompleted(book.id)) {
      return `${book.title} - ${this.t('common.completed')}`;
    }

    const percent = this.bookProgressPercent(book);
    if (typeof percent === 'number' && percent > 0) {
      return `${book.title} - ${this.t('common.inProgress')} (${percent}%)`;
    }

    return book.title;
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

  private pushNotification(text: string): void {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.notifications.update((items) => [...items, { id, text }].slice(-4));
    setTimeout(() => {
      this.notifications.update((items) => items.filter((item) => item.id !== id));
    }, 5000);
  }
}
