import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, type Params } from '@angular/router';
import { Subscription, catchError, forkJoin, map, of, skip } from 'rxjs';

import type {
  Book,
  BookFacets,
  BookSort,
  Collection,
  EditorialBlock,
  EditorialBlockItem,
} from '../../../core/models/api.models';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { I18nService } from '../../../core/services/i18n.service';
import { AuthService } from '../../../core/services/auth.service';
import { LibraryService } from '../../../core/services/library.service';
import { LibraryProgressService } from '../../../core/services/library-progress.service';
import { ProgressService } from '../../../core/services/progress.service';
import { SettingsService } from '../../../core/services/settings.service';
import { coverUrlForBook } from '../../../core/utils/cover-url';
import { FieldHelpComponent } from '../../../shared/ui/field-help/field-help.component';
import { BookCardComponent } from '../book-card/book-card.component';
import { CollectionCardComponent } from '../collection-card/collection-card.component';
import { persistPreferredLocale } from '../../../app.data';
import type { LengthFilter, LibraryView, ListenStatusFilter, ProgressRow, RailState, SeriesRail } from './library-page.types';
import {
  collectionPreviewUrls,
  computeListenedBookOrder,
  CONTINUE_LISTENING_LIMIT,
  dedupeBooks,
  deriveCollections,
  GRID_PAGE_SIZE,
  inProgressBookIds,
  LATEST_BOOKS_LIMIT,
  LENGTH_RANGES,
  mapSeriesRails,
  matchesListenStatus,
} from './library-page.utils';

const GRID_SORTS: BookSort[] = ['recent', 'title', 'author', 'series', 'duration', 'duration_desc'];
const STATUSES: ListenStatusFilter[] = ['all', 'unstarted', 'in_progress', 'finished'];
const LENGTHS: LengthFilter[] = ['any', 'short', 'medium', 'long'];

@Component({
  selector: 'app-library-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BookCardComponent, CollectionCardComponent, TranslatePipe, FieldHelpComponent],
  templateUrl: './library-page.component.html',
  styleUrl: './library-page.component.css',
})
// LibraryPageComponent composes catalog data, progress state, and collection
// rails into a single browsing view.
export class LibraryPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren('railEl', { read: ElementRef }) private railElements?: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  q = '';
  seriesSort: 'activity' | 'relevance' | 'alphabetical' = 'activity';
  collectionName = '';

  // Discovery filters. Any active filter switches the page to the results grid.
  readonly view = signal<LibraryView>('browse');
  readonly genre = signal('');
  readonly selectedTags = signal<string[]>([]);
  readonly status = signal<ListenStatusFilter>('all');
  readonly length = signal<LengthFilter>('any');
  readonly gridSort = signal<BookSort>('recent');
  readonly facets = signal<BookFacets | null>(null);
  readonly showAllGenres = signal(false);
  readonly showAllTags = signal(false);
  readonly statuses = STATUSES;
  readonly lengths = LENGTHS;
  readonly gridSorts = GRID_SORTS;

  readonly gridBooks = signal<Book[]>([]);
  readonly gridTotal = signal(0);
  readonly gridHasMore = signal(false);
  readonly gridLoading = signal(false);
  readonly progressById = signal<Map<string, ProgressRow>>(new Map());
  readonly continueBooks = signal<Book[]>([]);

  // Listening status is per-user, so it is applied client-side over server results.
  readonly visibleGridBooks = computed(() => {
    const status = this.status();
    const progress = this.progressById();
    return this.gridBooks().filter((book) => matchesListenStatus(status, progress.get(book.id)));
  });

  readonly latestBooks = signal<Book[]>([]);
  readonly featuredBlock = signal<EditorialBlock | null>(null);
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
  private gridSub?: Subscription;
  private gridOffset = 0;
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
    this.readFiltersFromUrl(this.route.snapshot.queryParams);
    this.reload();
    this.loadFacets();
    if (this.isGridMode()) {
      this.loadGrid(true);
    }
  }

  // "/" jumps to search, like most media apps.
  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
    if (event.key === '/' && !typing) {
      event.preventDefault();
      this.searchInput?.nativeElement.focus();
    } else if (event.key === 'Escape' && target === this.searchInput?.nativeElement && this.q) {
      this.q = '';
      this.applyFilters();
    }
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
    this.gridSub?.unsubscribe();
    this.railChangeSub?.unsubscribe();
    this.resizeObserver?.disconnect();
  }

  onFilterChange(): void {
    if (this.filterTimeout) {
      clearTimeout(this.filterTimeout);
    }
    this.filterTimeout = setTimeout(() => this.applyFilters(), 250);
  }

  onSeriesSortChange(): void {
    if (this.seriesFilterBooks) {
      this.loadSeriesChunk(0, this.seriesFilterBooks, false);
    }
  }

  clearFilter(): void {
    this.q = '';
    this.genre.set('');
    this.selectedTags.set([]);
    this.status.set('all');
    this.length.set('any');
    this.view.set('browse');
    this.applyFilters();
  }

  setGenre(genre: string): void {
    this.genre.set(this.genre() === genre ? '' : genre);
    this.applyFilters();
  }

  toggleTag(tag: string): void {
    const tags = this.selectedTags();
    this.selectedTags.set(tags.includes(tag) ? tags.filter((value) => value !== tag) : [...tags, tag]);
    this.applyFilters();
  }

  setStatus(status: ListenStatusFilter): void {
    this.status.set(status);
    this.applyFilters();
  }

  setLength(length: LengthFilter): void {
    this.length.set(length);
    this.applyFilters();
  }

  setGridSort(sort: BookSort): void {
    this.gridSort.set(sort);
    this.applyFilters();
  }

  setView(view: LibraryView): void {
    this.view.set(view);
    this.applyFilters();
  }

  isGridMode(): boolean {
    return this.view() === 'grid' || this.hasActiveQuery();
  }

  visibleGenres(): Array<{ value: string; count: number }> {
    const genres = this.facets()?.genres ?? [];
    return this.showAllGenres() ? genres : genres.slice(0, 10);
  }

  visibleTags(): Array<{ value: string; count: number }> {
    const tags = this.facets()?.tags ?? [];
    const top = this.showAllTags() ? tags : tags.slice(0, 14);
    // Keep selected tags visible even when they fall outside the top list.
    const missing = this.selectedTags()
      .filter((tag) => !top.some((item) => item.value === tag))
      .map((value) => ({ value, count: 0 }));
    return [...missing, ...top];
  }

  // Filters live in the URL so a filtered view survives reloads and back/forward.
  private applyFilters(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.filtersToParams(),
      replaceUrl: true,
    });
    if (this.isGridMode()) {
      this.loadGrid(true);
    } else {
      this.scheduleRailSync();
    }
  }

  loadMoreGrid(): void {
    if (!this.gridLoading() && this.gridHasMore()) {
      this.loadGrid(false);
    }
  }

  private loadGrid(reset: boolean): void {
    this.gridSub?.unsubscribe();
    if (reset) {
      this.gridOffset = 0;
      this.gridBooks.set([]);
      this.gridHasMore.set(false);
    }

    const range = this.length() === 'any' ? {} : LENGTH_RANGES[this.length() as Exclude<LengthFilter, 'any'>];
    this.gridLoading.set(true);
    this.gridSub = this.library
      .listBooks({
        q: this.q.trim() || undefined,
        genre: this.genre() || undefined,
        tags: this.selectedTags().join(',') || undefined,
        sort: this.gridSort(),
        minDuration: range.min,
        maxDuration: range.max,
        limit: GRID_PAGE_SIZE,
        offset: this.gridOffset,
      })
      .subscribe({
        next: (response) => {
          this.gridOffset += response.books.length;
          this.gridBooks.update((current) => (reset ? response.books : [...current, ...response.books]));
          this.gridTotal.set(response.total);
          this.gridHasMore.set(response.hasMore);
          this.gridLoading.set(false);

          // A status filter can hide most of a page; keep fetching until there is enough to show.
          if (response.hasMore && this.status() !== 'all' && this.visibleGridBooks().length < GRID_PAGE_SIZE / 2) {
            this.loadGrid(false);
          }
        },
        error: (error: unknown) => {
          this.error.set(error instanceof Error ? error.message : this.i18n.t('library.error.load'));
          this.gridLoading.set(false);
        },
      });
  }

  private loadFacets(): void {
    this.library.getBookFacets().subscribe({
      next: (facets) => this.facets.set(facets),
      error: () => this.facets.set(null),
    });
  }

  private loadContinueListening(progress: ProgressRow[]): void {
    const ids = inProgressBookIds(progress, CONTINUE_LISTENING_LIMIT);
    if (ids.length === 0) {
      this.continueBooks.set([]);
      return;
    }

    forkJoin(ids.map((id) => this.library.getBook(id).pipe(catchError(() => of(null)))))
      .pipe(map((books) => books.filter((book): book is Book => book !== null)))
      .subscribe((books) => {
        this.continueBooks.set(books);
        this.scheduleRailSync();
      });
  }

  private readFiltersFromUrl(params: Params): void {
    this.q = typeof params['q'] === 'string' ? params['q'] : '';
    this.genre.set(typeof params['genre'] === 'string' ? params['genre'] : '');
    this.selectedTags.set(typeof params['tags'] === 'string' ? params['tags'].split(',').filter(Boolean) : []);
    this.status.set(STATUSES.includes(params['status']) ? params['status'] : 'all');
    this.length.set(LENGTHS.includes(params['length']) ? params['length'] : 'any');
    this.gridSort.set(GRID_SORTS.includes(params['sort']) ? params['sort'] : 'recent');
    this.view.set(params['view'] === 'grid' ? 'grid' : 'browse');
  }

  private filtersToParams(): Params {
    const params: Params = {};
    if (this.q.trim()) params['q'] = this.q.trim();
    if (this.genre()) params['genre'] = this.genre();
    if (this.selectedTags().length > 0) params['tags'] = this.selectedTags().join(',');
    if (this.status() !== 'all') params['status'] = this.status();
    if (this.length() !== 'any') params['length'] = this.length();
    if (this.gridSort() !== 'recent') params['sort'] = this.gridSort();
    if (this.view() === 'grid') params['view'] = 'grid';
    return params;
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
      booksResponse: this.library.listBooks({ sort: 'recent', limit: 120, offset: 0 }),
      settings: this.settingsService.getMine(),
      progress: this.progressService.listMineAll(100),
      editorial: this.library.listEditorialBlocks('library').pipe(
        catchError(() => of({ blocks: [] })),
      ),
    }).subscribe({
      next: ({ booksResponse, settings, progress, editorial }) => {
        const frenchBooks = booksResponse.books.filter((book) => {
          const language = book.language?.toLowerCase();
          return language === 'fr' || language?.startsWith('fr-');
        });
        this.frenchBookCount.set(frenchBooks.length);
        this.featuredBlock.set(editorial.blocks[0] ?? null);

        const showCompleted = settings.library?.showCompleted ?? true;
        const completedIds = new Set(
          progress.filter((p) => p.completed).map((p) => p.bookId),
        );
        this.listenedBookIds.set(this.computeListenedBookOrder(progress));
        this.progressById.set(new Map(progress.map((row) => [row.bookId, row])));
        this.loadContinueListening(progress);
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
          '',
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
          '',
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
    return !this.hasActiveQuery() && !this.hasFeaturedRow() && this.latestBooks().length > 0;
  }

  hasFeaturedRow(): boolean {
    const block = this.featuredBlock();
    return !this.hasActiveQuery() && !!block && block.items.length > 0;
  }

  featuredItems(): EditorialBlockItem[] {
    return this.featuredBlock()?.items ?? [];
  }

  featuredCardCoverUrls(item: EditorialBlockItem): string[] {
    const token = this.auth.accessToken();
    if (!token) {
      return [];
    }

    if (item.entity.type === 'book') {
      const entity = item.entity;
      const url = coverUrlForBook(entity, token);
      return url ? [url] : [];
    }

    return item.entity.previewBooks
      .filter((book) => !!book.coverPath)
      .slice(0, 3)
      .map((book) => coverUrlForBook(book, token))
      .filter((url) => url.length > 0);
  }

  featuredCardLink(item: EditorialBlockItem): [string, string] {
    if (item.entity.type === 'book') {
      return ['/player', item.entity.id];
    }

    return ['/series', item.entity.name];
  }

  featuredCardSubtitle(item: EditorialBlockItem): string {
    if (item.kicker?.trim()) {
      return item.kicker.trim();
    }

    if (item.entity.type === 'book') {
      return item.entity.author;
    }

    return `${item.entity.bookCount} books`;
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
    return !this.loading() && !this.hasFeaturedRow() && this.latestBooks().length === 0 && this.seriesRails().length === 0;
  }

  hasActiveQuery(): boolean {
    return (
      this.q.trim().length > 0 ||
      this.genre().length > 0 ||
      this.selectedTags().length > 0 ||
      this.status() !== 'all' ||
      this.length() !== 'any'
    );
  }

  private bookPool(): Book[] {
    return dedupeBooks([...this.continueBooks(), ...this.latestBooks()], this.seriesRails());
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
