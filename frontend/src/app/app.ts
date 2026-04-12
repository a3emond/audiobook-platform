import { CommonModule } from '@angular/common';
import { Component, OnDestroy, effect, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';

import type { Book } from './core/models/api.models';
import { AuthService } from './core/services/auth.service';
import { LibraryProgressService } from './core/services/library-progress.service';
import { LibraryService } from './core/services/library.service';
import { ProgressService } from './core/services/progress.service';
import { SettingsService } from './core/services/settings.service';
import { I18nService } from './core/services/i18n.service';
import { RealtimeService } from './core/services/realtime.service';
import { PlayerService } from './core/services/player.service';
import { CoverTileComponent } from './shared/ui/cover-tile/cover-tile.component';
import { loadInProgressBooks, persistPreferredLocale } from './app.data';
import type { InProgressBookItem, ToastItem } from './app.types';
import {
  buildInProgressBooks,
  coverInitials,
  coverUrl,
  miniPlayerProgressPercent,
  notificationId,
} from './app.utils';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, CoverTileComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
// Root app shell: wires auth-sensitive layout, top-level realtime notifications,
// and shared topbar/progress-strip behaviors.
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
    protected readonly player: PlayerService,
  ) {
    // Keep in-progress strip synchronized with auth state.
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.loadInProgressBooks();
        return;
      }

      this.inProgressBooks.set([]);
    });

    // User profile locale wins when available.
    effect(() => {
      const locale = this.auth.user()?.profile.preferredLocale;
      if (locale === 'en' || locale === 'fr') {
        void this.i18n.setLocale(locale);
      }
    });

    // Any persisted progress change can affect the continue-listening strip.
    this.progressChangedSub = this.progressService.progressChanged$.subscribe(() => {
      if (this.auth.isAuthenticated()) {
        this.loadInProgressBooks();
      }
    });

    // Realtime notifications are intentionally lightweight toast updates only.
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

  isAdminRoute(): boolean {
    return this.router.url.startsWith('/admin');
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

    try {
      const persisted = await persistPreferredLocale(locale, this.i18n, this.auth, this.settingsService);
      if (persisted) {
        this.loadInProgressBooks();
      }
    } catch {
      // Keep the local choice even if persistence fails.
    }
  }

  coverUrl(book: Book): string {
    return coverUrl(book, this.auth.accessToken());
  }

  coverInitials(book: Book): string {
    return coverInitials(book);
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

  miniPlayerProgressPercent(): number {
    return miniPlayerProgressPercent(this.player.currentSeconds(), this.player.durationSeconds());
  }

  private loadInProgressBooks(): void {
    loadInProgressBooks(this.progressService, this.libraryService, {
      onLoaded: (items) => {
        this.inProgressBooks.set(items);
      },
      onError: () => {
        this.inProgressBooks.set([]);
      },
    });
  }

  private pushNotification(text: string): void {
    const id = notificationId();
    this.notifications.update((items) => [...items, { id, text }].slice(-4));
    setTimeout(() => {
      this.notifications.update((items) => items.filter((item) => item.id !== id));
    }, 5000);
  }
}
