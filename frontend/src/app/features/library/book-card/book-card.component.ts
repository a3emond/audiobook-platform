import { Component, Input, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Book } from '../../../core/models/api.models';
import { AuthService } from '../../../core/services/auth.service';
import { CompletedBooksService } from '../../../core/services/completed-books.service';
import { I18nService } from '../../../core/services/i18n.service';
import { CoverTileComponent } from '../../../shared/ui/cover-tile/cover-tile.component';

@Component({
  selector: 'app-book-card',
  standalone: true,
  imports: [RouterLink, CoverTileComponent],
  templateUrl: './book-card.component.html',
  styleUrl: './book-card.component.css',
})
export class BookCardComponent {
  @Input({ required: true }) book!: Book;

  private readonly auth = inject(AuthService);
  private readonly completedBooks = inject(CompletedBooksService);
  protected readonly i18n = inject(I18nService);
  readonly detailOpen = signal(false);

  readonly coverUrl = computed(() => {
    if (!this.book?.coverPath) {
      return '';
    }

    const token = this.auth.accessToken();
    if (!token) {
      return '';
    }

    return `/streaming/books/${this.book.id}/cover?access_token=${encodeURIComponent(token)}`;
  });

  coverInitials(): string {
    const fromTitle = (this.book?.title ?? '')
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
    return this.completedBooks.isCompleted(this.book.id);
  }

  openDetails(): void {
    this.detailOpen.set(true);
  }

  closeDetails(): void {
    this.detailOpen.set(false);
  }

  descriptionText(): string {
    const locale = this.i18n.locale();
    const localized = locale === 'fr'
      ? this.book.description?.fr ?? this.book.description?.default ?? this.book.description?.en
      : this.book.description?.en ?? this.book.description?.default ?? this.book.description?.fr;

    return localized ?? this.i18n.t('book.description.empty');
  }
}
