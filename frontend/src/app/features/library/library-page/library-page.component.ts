import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, OnInit, QueryList, ViewChildren, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, skip } from 'rxjs';

import type {
  Book,
  Collection,
} from '../../../core/models/api.models';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { I18nService } from '../../../core/services/i18n.service';
import { AuthService } from '../../../core/services/auth.service';
import { LibraryService } from '../../../core/services/library.service';
import { LibraryProgressService } from '../../../core/services/library-progress.service';
import { ProgressService } from '../../../core/services/progress.service';
import { SettingsService } from '../../../core/services/settings.service';
import { BookCardComponent } from '../book-card/book-card.component';
import { CollectionCardComponent } from '../collection-card/collection-card.component';
import { persistPreferredLocale } from '../../../app.data';
import type { RailState, SeriesRail } from './library-page.types';
import {
  collectionPreviewUrls,
  computeListenedBookOrder,
  dedupeBooks,
  deriveCollections,
  LATEST_BOOKS_LIMIT,
  mapSeriesRails,
} from './library-page.utils';

@Component({
  selector: 'app-library-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BookCardComponent, CollectionCardComponent, TranslatePipe],
  templateUrl: './library-page.component.html',
  styleUrl: './library-page.component.css',
})
// LibraryPageComponent composes catalog data, progress state, and collection
// rails into a single browsing view.
export class LibraryPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren('railEl', { read: ElementRef }) private railElements?: QueryList<ElementRef<HTMLElement>>;

  q = '';
  seriesTags = '';
  seriesSort: 'activity' | 'relevance' | 'alphabetical' = 'activity';
  collectionName = '';

  readonly latestBooks = signal<Book[]>([]);
  readonly frenchBookCount = signal(0);
  readonly seriesRails = signal<SeriesRail[]>([]);
  readonly seriesPageSize = 6;
  readonly seriesLoadedCount = signal(0);
  readonly seriesTotal = signal(0);
  readonly seriesHasMore = signal(false);
  readonly seriesLoading = signal(false);
  readonly collections = signal<Collection[]>([]);
  readonly filteredCollections = signal<Collection[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly collectionsHasMore = signal(false);
  readonly collectionsTotal = signal(0);
  readonly collectionsLoadingMore = signal(false);

  readonly createCollectionOpen = signal(false);
  readonly collectionModalError = signal<string | null>(null);
  readonly railStates = signal<Record<string, RailState>>({});
  readonly listenedBookIds = signal<string[]>([]);

  private filterTimeout?: ReturnType<typeof setTimeout>;
  private railChangeSub?: { unsubscribe(): void };
  private resizeObserver?: ResizeObserver;
  private seriesFilterBooks: ((books: Book[]) => Book[]) | null = null;

  constructor(
    protected readonly i18n: I18nService,
    private readonly library: LibraryService,
    private readonly auth: AuthService,
    private readonly libraryProgress: LibraryProgressService,
    private readonly settingsService: SettingsService,
    private readonly progressService: ProgressService,
  ) {
    const destroyRef = inject(DestroyRef);
    // Reload when the locale changes (skip(1) ignores the initial emit so reload()
    // runs only on actual locale changes, not during construction).
    toObservable(this.i18n.locale)
      .pipe(skip(1), takeUntilDestroyed(destroyRef))
      .subscribe(() => this.reload());
  }

  ngOnInit(): void {
    this.reload();
  }

  ngAfterViewInit(): void {
    this.railChangeSub = this.railElements?.changes.subscribe(() => {
      this.observeRails();
      this.syncAllRails();
    });

    this.observeRails();
    this.syncAllRails();
  }

  ngOnDestroy(): void {
    this.railChangeSub?.unsubscribe();
    this.resizeObserver?.disconnect();
  }

  onFilterChange(): void {
    if (this.filterTimeout) {
      clearTimeout(this.filterTimeout);
    }
    this.filterTimeout = setTimeout(() => this.reload(), 250);
  }

  clearFilter(): void {
    if (!this.q.trim() && !this.seriesTags.trim()) {
      return;
    }

    this.q = '';
    this.seriesTags = '';
    this.reload();
  }

  async switchBackToEnglish(): Promise<void> {
    if (!this.i18n.isFrench()) {
      return;
    }

    try {
      await persistPreferredLocale('en', this.i18n, this.auth, this.settingsService);
    } catch {
      // Keep local UI stable if profile persistence fails.
    }
  }

  shouldShowFrenchEnglishFallbackNotice(): boolean {
    return this.i18n.isFrench() && this.frenchBookCount() === 0;
  }

  // Reload orchestrates the page bootstrap: books, user settings, and progress
  // are fetched together so filtering and rails stay consistent.
  reload(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      booksResponse: this.library.listBooks({ q: this.q || undefined, limit: 120, offset: 0 }),
      settings: this.settingsService.getMine(),
      progress: this.progressService.listMineAll(100),
    }).subscribe({
      next: ({ booksResponse, settings, progress }) => {
        const frenchBooks = booksResponse.books.filter((book) => {
          const language = book.language?.toLowerCase();
          return language === 'fr' || language?.startsWith('fr-');
        });
        this.frenchBookCount.set(frenchBooks.length);

        const showCompleted = settings.library?.showCompleted ?? true;
        const completedIds = new Set(
          progress.filter((p) => p.completed).map((p) => p.bookId),
        );
        this.listenedBookIds.set(this.computeListenedBookOrder(progress));
        const filterBooks = (books: Book[]): Book[] =>
          showCompleted ? books : books.filter((b) => !completedIds.has(b.id));
        this.seriesFilterBooks = filterBooks;

        this.latestBooks.set(filterBooks(booksResponse.books).slice(0, LATEST_BOOKS_LIMIT));
        this.loadSeriesChunk(0, filterBooks, false, () => this.loadCollections());
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : this.i18n.t('library.error.load'));
        this.loading.set(false);
      },
    });
  }

  // Collections are loaded after series/books so derived activity data can reuse
  // the same listened-book ordering.
  private loadCollections(): void {
    this.library.listCollections(24, 0).subscribe({
      next: (response) => {
        const derived = deriveCollections(
          response.collections,
          this.listenedBookIds(),
          this.q,
          this.i18n.t('library.activityCollection'),
        );

        this.collections.set(derived.collections);
        this.filteredCollections.set(derived.filteredCollections);
        this.collectionsHasMore.set(response.hasMore);
        this.collectionsTotal.set(response.total);
        this.loading.set(false);
        this.scheduleRailSync();
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : this.i18n.t('library.error.collections'));
        this.loading.set(false);
      },
    });
  }

  loadMoreCollections(): void {
    if (!this.collectionsHasMore() || this.collectionsLoadingMore()) {
      return;
    }

    this.collectionsLoadingMore.set(true);
    const offset = this.collections().length;

    this.library.listCollections(24, offset).subscribe({
      next: (response) => {
        const allCollections = [...this.collections(), ...response.collections];
        const derived = deriveCollections(
          allCollections,
          this.listenedBookIds(),
          this.q,
          this.i18n.t('library.activityCollection'),
        );

        this.collections.set(derived.collections);
        this.filteredCollections.set(derived.filteredCollections);
        this.collectionsHasMore.set(response.hasMore);
        this.collectionsTotal.set(response.total);
        this.collectionsLoadingMore.set(false);
        this.scheduleRailSync();
      },
      error: () => {
        this.collectionsLoadingMore.set(false);
      },
    });
  }

  private loadSeriesChunk(
    offset: number,
    filterBooks: (books: Book[]) => Book[],
    append: boolean,
    onDone?: () => void,
  ): void {
    // Series is paginated independently from books because each series rail
    // requires additional detail calls.
    this.seriesLoading.set(true);

    this.library
      .listSeries({
        q: this.q || undefined,
        tags: this.seriesTags.trim() || undefined,
        sort: this.seriesSort,
        limit: this.seriesPageSize,
        offset,
      })
      .subscribe({
        next: (seriesResponse) => {
          this.seriesLoadedCount.set(Math.min(seriesResponse.total, offset + seriesResponse.series.length));
          this.seriesTotal.set(seriesResponse.total);
          this.seriesHasMore.set(seriesResponse.hasMore);

          if (seriesResponse.series.length === 0) {
            if (!append) {
              this.seriesRails.set([]);
            }
            this.seriesLoading.set(false);
            onDone?.();
            return;
          }

          forkJoin(seriesResponse.series.map((series) => this.library.getSeries(series.name))).subscribe({
            next: (seriesDetails) => {
              const nextRails = mapSeriesRails(seriesDetails, filterBooks);
              this.seriesRails.update((current) => (append ? [...current, ...nextRails] : nextRails));
              this.seriesLoading.set(false);
              this.scheduleRailSync();
              onDone?.();
            },
            error: (error: unknown) => {
              this.error.set(error instanceof Error ? error.message : this.i18n.t('library.error.seriesRows'));
              this.seriesLoading.set(false);
              this.loading.set(false);
            },
          });
        },
        error: (error: unknown) => {
          this.error.set(error instanceof Error ? error.message : this.i18n.t('library.error.series'));
          this.seriesLoading.set(false);
          this.loading.set(false);
        },
      });
  }

  loadMoreSeries(): void {
    if (this.seriesLoading() || !this.seriesHasMore() || !this.seriesFilterBooks) {
      return;
    }

    this.loadSeriesChunk(this.seriesLoadedCount(), this.seriesFilterBooks, true);
  }

  openCreateCollectionModal(): void {
    this.collectionName = '';
    this.collectionModalError.set(null);
    this.createCollectionOpen.set(true);
  }

  closeCreateCollectionModal(): void {
    this.createCollectionOpen.set(false);
    this.collectionModalError.set(null);
  }

  createCollection(): void {
    const name = this.collectionName.trim();
    if (!name) {
      this.collectionModalError.set(this.i18n.t('collections.nameRequired'));
      return;
    }

    this.library.createCollection(name).subscribe({
      next: () => {
        this.closeCreateCollectionModal();
        this.reload();
      },
      error: (error: unknown) => {
        this.collectionModalError.set(error instanceof Error ? error.message : this.i18n.t('collections.createError'));
      },
    });
  }

  collectionPreviewUrls(collection: Collection): Array<{ bookId: string; url: string }> {
    return collectionPreviewUrls(collection, this.auth.accessToken(), this.bookPool());
  }

  scrollRail(key: string, rail: HTMLElement, direction: 1 | -1): void {
    rail.scrollBy({
      left: direction * 420,
      behavior: 'smooth',
    });

    requestAnimationFrame(() => this.syncRailState(key, rail));
  }

  onRailScroll(key: string, rail: HTMLElement): void {
    this.syncRailState(key, rail);
  }

  railOverflows(key: string): boolean {
    return this.railStates()[key]?.overflow ?? false;
  }

  canScrollLeft(key: string): boolean {
    return this.railStates()[key]?.canScrollLeft ?? false;
  }

  canScrollRight(key: string): boolean {
    return this.railStates()[key]?.canScrollRight ?? false;
  }

  showLatestRow(): boolean {
    return !this.hasActiveQuery() && this.latestBooks().length > 0;
  }

  hasSeriesRows(): boolean {
    return this.seriesRails().length > 0;
  }

  seriesProgressPercent(series: SeriesRail): number {
    return this.libraryProgress.aggregateProgressForBooks(series.books).percent;
  }

  visibleCollections(): Collection[] {
    return this.filteredCollections();
  }

  shouldShowNoBooksState(): boolean {
    return !this.loading() && this.latestBooks().length === 0 && this.seriesRails().length === 0;
  }

  hasActiveQuery(): boolean {
    return this.q.trim().length > 0 || this.seriesTags.trim().length > 0;
  }

  private bookPool(): Book[] {
    return dedupeBooks(this.latestBooks(), this.seriesRails());
  }

  private observeRails(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const rail = entry.target as HTMLElement;
          const key = rail.dataset['railId'];
          if (!key) {
            continue;
          }
          this.syncRailState(key, rail);
        }
      });
    }

    this.resizeObserver.disconnect();
    for (const railRef of this.railElements?.toArray() ?? []) {
      this.resizeObserver.observe(railRef.nativeElement);
    }
  }

  private syncAllRails(): void {
    for (const railRef of this.railElements?.toArray() ?? []) {
      const rail = railRef.nativeElement;
      const key = rail.dataset['railId'];
      if (!key) {
        continue;
      }
      this.syncRailState(key, rail);
    }
  }

  private syncRailState(key: string, rail: HTMLElement): void {
    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const overflow = maxScrollLeft > 1;
    const next: RailState = {
      overflow,
      canScrollLeft: overflow && rail.scrollLeft > 1,
      canScrollRight: overflow && rail.scrollLeft < maxScrollLeft - 1,
    };

    const previous = this.railStates()[key];
    if (
      previous &&
      previous.overflow === next.overflow &&
      previous.canScrollLeft === next.canScrollLeft &&
      previous.canScrollRight === next.canScrollRight
    ) {
      return;
    }

    this.railStates.update((state) => ({ ...state, [key]: next }));
  }

  private scheduleRailSync(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.observeRails();
        this.syncAllRails();
      });
    });
  }

  private computeListenedBookOrder(progress: Array<{ bookId: string; completed: boolean; positionSeconds: number; lastListenedAt: string | null }>): string[] {
    return computeListenedBookOrder(progress);
  }
}
