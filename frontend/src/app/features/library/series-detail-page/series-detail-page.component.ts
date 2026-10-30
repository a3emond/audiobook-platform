import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { skip } from 'rxjs';

import type { Book, SeriesDetail } from '../../../core/models/api.models';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { LibraryProgressService } from '../../../core/services/library-progress.service';
import { LibraryService } from '../../../core/services/library.service';
import { coverUrlForBook } from '../../../core/utils/cover-url';
import { CoverTileComponent } from '../../../shared/ui/cover-tile/cover-tile.component';
import { buildShelfEntries, nextBook } from '../shelf/shelf.utils';

@Component({
  selector: 'app-series-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink, CoverTileComponent, TranslatePipe],
  templateUrl: './series-detail-page.component.html',
  styleUrl: './series-detail-page.component.css',
})
// series-detail-page: a series hero (fanned covers, progress, resume) over
// its books as a numbered list in reading order.
export class SeriesDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly library = inject(LibraryService);
  private readonly libraryProgress = inject(LibraryProgressService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly destroyRef = inject(DestroyRef);
  private seriesName = '';

  readonly series = signal<SeriesDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly aggregateProgress = computed(() => {
    const currentSeries = this.series();
    if (!currentSeries) {
      return null;
    }

    return this.libraryProgress.aggregateProgressForBooks(currentSeries.books);
  });

  private readonly progressFor = (bookId: string) => this.libraryProgress.progressForBook(bookId);

  // Books in reading order, grouped the same way the library shelf groups them.
  readonly entry = computed(() => {
    const current = this.series();
    return current ? buildShelfEntries(current.books.map((book) => ({ ...book, series: current.name })), this.progressFor)[0] ?? null : null;
  });
  readonly books = computed(() => this.entry()?.books ?? []);
  readonly next = computed(() => {
    const entry = this.entry();
    return entry ? nextBook(entry, this.progressFor) : null;
  });
  readonly fanBooks = computed(() => {
    const next = this.next() ?? this.books()[0];
    return next ? [next, ...this.books().filter((book) => book.id !== next.id)].slice(0, 3) : [];
  });
  readonly expanded = signal<string | null>(null);

  constructor() {
    // Reload when the locale changes (skip(1) ignores the initial emit).
    toObservable(this.i18n.locale)
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.seriesName) {
          this.loadSeries(this.seriesName);
        }
      });
  }

  ngOnInit(): void {
    // React to route param changes so the component works correctly when the router
    // reuses the instance (e.g. navigating between series from a search result).
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.seriesName = params.get('seriesName') ?? '';
        if (!this.seriesName) {
          this.error.set(this.i18n.t('series.error.missingName'));
          return;
        }
        this.loadSeries(this.seriesName);
      });
  }

  private loadSeries(seriesName: string): void {
    this.loading.set(true);
    this.library.getSeries(seriesName).subscribe({
      next: (series) => {
        this.series.set(series);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : this.i18n.t('series.error.load'));
        this.loading.set(false);
      },
    });
  }

  coverUrl(book: Book): string {
    return coverUrlForBook(book, this.auth.accessToken());
  }

  initials(book: Book): string {
    return book.title.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'BK';
  }

  isCompleted(book: Book): boolean {
    return this.libraryProgress.isCompleted(book.id);
  }

  percent(book: Book): number {
    return this.libraryProgress.progressPercentForBook(book) ?? 0;
  }

  remaining(book: Book): string {
    return this.formatDuration(Math.max(0, book.duration - this.libraryProgress.listenedSecondsForBook(book)));
  }

  finishedCount(): number {
    return this.books().filter((book) => this.isCompleted(book)).length;
  }

  description(book: Book): string {
    const d = book.description;
    const text = this.i18n.locale() === 'fr' ? d?.fr ?? d?.default ?? d?.en : d?.en ?? d?.default ?? d?.fr;
    return text?.trim() ?? '';
  }

  toggle(book: Book): void {
    this.expanded.set(this.expanded() === book.id ? null : book.id);
  }

  formatDuration(totalSeconds: number): string {
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
      return this.i18n.t('book.duration.unknown');
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    }

    if (hours > 0) {
      return `${hours}h`;
    }

    return `${Math.max(1, minutes)}m`;
  }
}
