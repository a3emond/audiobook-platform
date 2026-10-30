import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, type Params } from '@angular/router';
import { Subscription, catchError, forkJoin, of, skip } from 'rxjs';

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
import { SeriesModalComponent } from '../shelf/series-modal.component';
import { ShelfCardComponent } from '../shelf/shelf-card.component';
import {
  SHELF_SCOPES,
  SHELF_SORTS,
  bookMatches,
  buildShelfEntries,
  entryState,
  formatHours,
  matchesScope,
  sortShelf,
  type ShelfEntry,
  type ShelfScope,
  type ShelfSort,
} from '../shelf/shelf.utils';
import { persistPreferredLocale } from '../../../app.data';
import type { LengthFilter, LibraryView, ListenStatusFilter, ProgressRow, RailState } from './library-page.types';
import {
  collectionPreviewUrls,
  computeListenedBookOrder,
  deriveCollections,
  GRID_PAGE_SIZE,
  LENGTH_RANGES,
  matchesListenStatus,
} from './library-page.utils';

const GRID_SORTS: BookSort[] = ['recent', 'title', 'author', 'series', 'duration', 'duration_desc'];
const STATUSES: ListenStatusFilter[] = ['all', 'unstarted', 'in_progress', 'finished'];
const LENGTHS: LengthFilter[] = ['any', 'short', 'medium', 'long'];
const TOP_TAGS = 18;

@Component({
  selector: 'app-library-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    BookCardComponent,
    CollectionCardComponent,
    ShelfCardComponent,
    SeriesModalComponent,
    TranslatePipe,
    FieldHelpComponent,
  ],
  templateUrl: './library-page.component.html',
  styleUrl: './library-page.component.css',
})
// LibraryPageComponent: the shelf (every series as a fan of covers, every
// standalone book as a cover, filtered instantly in the browser) and the flat
// "All books" grid searched on the server, sharing one set of filters.
export class LibraryPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren('railEl', { read: ElementRef }) private railElements?: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  collectionName = '';

  readonly view = signal<LibraryView>('browse');
  readonly q = signal('');
  readonly genre = signal('');
  readonly selectedTags = signal<string[]>([]);
  readonly status = signal<ListenStatusFilter>('all');
  readonly length = signal<LengthFilter>('any');
  readonly gridSort = signal<BookSort>('recent');
  readonly shelfSort = signal<ShelfSort>('activity');
  readonly shelfScope = signal<ShelfScope>('all');
  readonly facets = signal<BookFacets | null>(null);
  readonly tagsOpen = signal(false);
  readonly statuses = STATUSES;
  readonly lengths = LENGTHS;
  readonly gridSorts = GRID_SORTS;
  readonly shelfSorts = SHELF_SORTS;
  readonly shelfScopes = SHELF_SCOPES;

  // ----- Shelf -----
  readonly shelfBooks = signal<Book[]>([]);
  readonly showCompleted = signal(true);
  readonly openEntry = signal<ShelfEntry | null>(null);

  private readonly progressFor = (bookId: string) => this.libraryProgress.progressForBook(bookId);

  readonly allEntries = computed(() => buildShelfEntries(this.shelfBooks(), this.progressFor));

  readonly shelfEntries = computed(() => {
    const range = this.length() === 'any' ? {} : LENGTH_RANGES[this.length() as Exclude<LengthFilter, 'any'>];
    const filter = {
      q: this.q().trim(),
      genre: this.genre(),
      tags: this.selectedTags(),
      minDuration: range.min,
      maxDuration: range.max,
    };
    const status = this.status();
    const scope = this.shelfScope();
    const hideFinished = !this.showCompleted() && status !== 'finished';

    const entries = this.allEntries().filter((entry) => {
      if (!matchesScope(entry, scope)) return false;
      const state = entryState(entry);
      if (status !== 'all' && state !== status) return false;
      if (hideFinished && state === 'finished') return false;
      return entry.books.some((book) => bookMatches(book, filter));
    });
    return sortShelf(entries, this.shelfSort());
  });

  readonly shelfSummary = computed(() => {
    const entries = this.allEntries();
    return {
      books: this.shelfBooks().length,
      series: entries.filter((entry) => entry.kind === 'series').length,
      hours: formatHours(this.shelfBooks().reduce((sum, book) => sum + Math.max(0, book.duration), 0)),
    };
  });

  // ----- All books grid -----
  readonly gridBooks = signal<Book[]>([]);
  readonly gridTotal = signal(0);
  readonly gridHasMore = signal(false);
  readonly gridLoading = signal(false);
  readonly progressById = signal<Map<string, ProgressRow>>(new Map());

  // Listening status is per-user, so it is applied client-side over server results.
  readonly visibleGridBooks = computed(() => {
    const status = this.status();
    const progress = this.progressById();
    return this.gridBooks().filter((book) => matchesListenStatus(status, progress.get(book.id)));
  });

  // ----- Featured + collections -----
  readonly featuredBlock = signal<EditorialBlock | null>(null);
  readonly frenchBookCount = signal(0);
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
    if (event.key === '/' && !typing && !this.openEntry()) {
      event.preventDefault();
      this.searchInput?.nativeElement.focus();
    } else if (event.key === 'Escape' && target === this.searchInput?.nativeElement && this.q()) {
      this.setQuery('');
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

  // The shelf filters as you type; the server grid waits for a pause.
  setQuery(value: string): void {
    this.q.set(value);
    if (this.filterTimeout) {
      clearTimeout(this.filterTimeout);
    }
    this.filterTimeout = setTimeout(() => this.applyFilters(), 250);
  }

  clearFilter(): void {
    this.q.set('');
    this.genre.set('');
    this.selectedTags.set([]);
    this.status.set('all');
    this.length.set('any');
    this.shelfScope.set('all');
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

  setShelfSort(sort: ShelfSort): void {
    this.shelfSort.set(sort);
    this.applyFilters();
  }

  setShelfScope(scope: ShelfScope): void {
    this.shelfScope.set(scope);
    this.applyFilters();
  }

  setView(view: LibraryView): void {
    if (this.view() === view) return;
    this.view.set(view);
    this.applyFilters();
  }

  isGridMode(): boolean {
    return this.view() === 'grid';
  }

  openShelfEntry(entry: ShelfEntry): void {
    this.openEntry.set(entry);
  }

  closeShelfEntry(): void {
    this.openEntry.set(null);
  }

  genres(): Array<{ value: string; count: number }> {
    return this.facets()?.genres ?? [];
  }

  visibleTags(): Array<{ value: string; count: number }> {
    const tags = this.facets()?.tags ?? [];
    const top = this.tagsOpen() ? tags : tags.slice(0, TOP_TAGS);
    // Keep selected tags visible even when they fall outside the top list.
    const missing = this.selectedTags()
      .filter((tag) => !top.some((item) => item.value === tag))
      .map((value) => ({ value, count: 0 }));
    return [...missing, ...top];
  }

  hiddenTagCount(): number {
    return Math.max(0, (this.facets()?.tags?.length ?? 0) - TOP_TAGS);
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
        q: this.q().trim() || undefined,
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

  private readFiltersFromUrl(params: Params): void {
    this.q.set(typeof params['q'] === 'string' ? params['q'] : '');
    this.genre.set(typeof params['genre'] === 'string' ? params['genre'] : '');
    this.selectedTags.set(typeof params['tags'] === 'string' ? params['tags'].split(',').filter(Boolean) : []);
    this.status.set(STATUSES.includes(params['status']) ? params['status'] : 'all');
    this.length.set(LENGTHS.includes(params['length']) ? params['length'] : 'any');
    this.gridSort.set(GRID_SORTS.includes(params['sort']) ? params['sort'] : 'recent');
    this.shelfSort.set(SHELF_SORTS.includes(params['order']) ? params['order'] : 'activity');
    this.shelfScope.set(SHELF_SCOPES.includes(params['show']) ? params['show'] : 'all');
    this.view.set(params['view'] === 'grid' ? 'grid' : 'browse');
  }

  private filtersToParams(): Params {
    const params: Params = {};
    if (this.q().trim()) params['q'] = this.q().trim();
    if (this.genre()) params['genre'] = this.genre();
    if (this.selectedTags().length > 0) params['tags'] = this.selectedTags().join(',');
    if (this.status() !== 'all') params['status'] = this.status();
    if (this.length() !== 'any') params['length'] = this.length();
    if (this.view() === 'grid') {
      params['view'] = 'grid';
      if (this.gridSort() !== 'recent') params['sort'] = this.gridSort();
    } else {
      if (this.shelfSort() !== 'activity') params['order'] = this.shelfSort();
      if (this.shelfScope() !== 'all') params['show'] = this.shelfScope();
    }
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

  // The whole catalog arrives in one compact request; settings, progress and
  // the featured block load alongside it.
  reload(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      shelf: this.library.listShelf(),
      settings: this.settingsService.getMine(),
      progress: this.progressService.listMineAll(100),
      editorial: this.library.listEditorialBlocks('library').pipe(
        catchError(() => of({ blocks: [] })),
      ),
    }).subscribe({
      next: ({ shelf, settings, progress, editorial }) => {
        this.frenchBookCount.set(
          shelf.books.filter((book) => {
            const language = book.language?.toLowerCase();
            return language === 'fr' || language?.startsWith('fr-');
          }).length,
        );
        this.featuredBlock.set(editorial.blocks[0] ?? null);
        this.showCompleted.set(settings.library?.showCompleted ?? true);
        this.listenedBookIds.set(computeListenedBookOrder(progress));
        this.progressById.set(new Map(progress.map((row) => [row.bookId, row])));
        this.shelfBooks.set(shelf.books);
        this.loading.set(false);
        this.loadCollections();
        this.scheduleRailSync();
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : this.i18n.t('library.error.load'));
        this.loading.set(false);
      },
    });
  }

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
        this.scheduleRailSync();
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : this.i18n.t('library.error.collections'));
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
    return collectionPreviewUrls(collection, this.auth.accessToken(), this.shelfBooks());
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

  // Featured series open in the shelf modal when the shelf knows them.
  openFeatured(item: EditorialBlockItem, event: MouseEvent): void {
    const key = item.entity.type === 'book' ? `book:${item.entity.id}` : `series:${item.entity.name.trim().toLocaleLowerCase()}`;
    const entry = this.allEntries().find((candidate) => candidate.key === key);
    if (entry) {
      event.preventDefault();
      this.openShelfEntry(entry);
    }
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

  visibleCollections(): Collection[] {
    return this.filteredCollections();
  }

  hasActiveQuery(): boolean {
    return (
      this.q().trim().length > 0 ||
      this.genre().length > 0 ||
      this.selectedTags().length > 0 ||
      this.status() !== 'all' ||
      this.length() !== 'any' ||
      (!this.isGridMode() && this.shelfScope() !== 'all')
    );
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
}
