import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Book } from '../../../core/models/api.models';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { LibraryProgressService } from '../../../core/services/library-progress.service';
import { ReadMoreComponent } from '../../../shared/ui/read-more/read-more.component';
import { CoverTileComponent } from '../../../shared/ui/cover-tile/cover-tile.component';

@Component({
  selector: 'app-book-card',
  standalone: true,
  imports: [RouterLink, CoverTileComponent, ReadMoreComponent],
  templateUrl: './book-card.component.html',
  styleUrl: './book-card.component.css',
})
// book-card: keeps UI and state logic readable for this frontend unit.
export class BookCardComponent {
  readonly book = input.required<Book>();

  protected readonly auth = inject(AuthService);
  private readonly libraryProgress = inject(LibraryProgressService);
  protected readonly i18n = inject(I18nService);
  readonly detailOpen = signal(false);

  readonly coverUrl = computed(() => {
    const b = this.book();
    if (!b?.coverPath) {
      return '';
    }

    const token = this.auth.accessToken();
    if (!token) {
      return '';
    }

    return `/streaming/books/${b.id}/cover?access_token=${encodeURIComponent(token)}`;
  });

  coverInitials(): string {
    const fromTitle = (this.book()?.title ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');

    return fromTitle || 'BK';
  }

  formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return this.i18n.t('book.duration.unknown');
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
  }

  isCompleted(): boolean {
    return this.libraryProgress.isCompleted(this.book().id);
  }

  progressPercent(): number | null {
    return this.libraryProgress.progressPercentForBook(this.book());
  }

  openDetails(): void {
    this.detailOpen.set(true);
  }

  closeDetails(): void {
    this.detailOpen.set(false);
  }

  descriptionText(): string {
    const locale = this.i18n.locale();
    const b = this.book();
    const localized = locale === 'fr'
      ? b.description?.fr ?? b.description?.default ?? b.description?.en
      : b.description?.en ?? b.description?.default ?? b.description?.fr;

    return localized ?? this.i18n.t('book.description.empty');
  }
}
