import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChildren, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import type {
  Book,
  Collection,
} from '../../../core/models/api.models';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { I18nService } from '../../../core/services/i18n.service';
import { AuthService } from '../../../core/services/auth.service';
import { LibraryService } from '../../../core/services/library.service';
import { ProgressService } from '../../../core/services/progress.service';
import { SettingsService } from '../../../core/services/settings.service';
import { BookCardComponent } from '../book-card/book-card.component';
import { CollectionCardComponent } from '../collection-card/collection-card.component';

interface SeriesRail {
  id: string;
  name: string;
  books: Book[];
}

interface RailState {
  overflow: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

const AUTO_ACTIVITY_COLLECTION_ID = 'auto:listened';

@Component({
  selector: 'app-library-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BookCardComponent, CollectionCardComponent, TranslatePipe],
  templateUrl: './library-page.component.html',
  styleUrl: './library-page.component.css',
})
export class LibraryPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren('railEl', { read: ElementRef }) private railElements?: QueryList<ElementRef<HTMLElement>>;

  q = '';
  collectionName = '';

  readonly latestBooks = signal<Book[]>([]);
  readonly seriesRails = signal<SeriesRail[]>([]);
  readonly collections = signal<Collection[]>([]);
  readonly filteredCollections = signal<Collection[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly createCollectionOpen = signal(false);
  readonly collectionModalError = signal<string | null>(null);
  readonly railStates = signal<Record<string, RailState>>({});
  readonly listenedBookIds = signal<string[]>([]);

  private filterTimeout?: ReturnType<typeof setTimeout>;
  private railChangeSub?: { unsubscribe(): void };
  private resizeObserver?: ResizeObserver;

  constructor(
    protected readonly i18n: I18nService,
    private readonly library: LibraryService,
    private readonly auth: AuthService,
    private readonly settingsService: SettingsService,
    private readonly progressService: ProgressService,
  ) {
    let initialized = false;
    effect(() => {
      this.i18n.locale();
      if (!initialized) {
        initialized = true;
        return;
      }

      this.reload();
    });
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
    if (!this.q.trim()) {
      return;
    }

    this.q = '';
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      booksResponse: this.library.listBooks({ q: this.q || undefined, limit: 120, offset: 0 }),
      settings: this.settingsService.getMine(),
      progress: this.progressService.listMineAll(100),
    }).subscribe({
      next: ({ booksResponse, settings, progress }) => {
        const showCompleted = settings.library?.showCompleted ?? true;
        const completedIds = new Set(
          progress.filter((p) => p.completed).map((p) => p.bookId),
        );
        this.listenedBookIds.set(this.computeListenedBookOrder(progress));
        const filterBooks = (books: Book[]): Book[] =>
          showCompleted ? books : books.filter((b) => !completedIds.has(b.id));

        this.latestBooks.set(filterBooks(booksResponse.books));

        this.library.listSeries({ q: this.q || undefined, limit: 10, offset: 0 }).subscribe({
          next: (seriesResponse) => {
            const topSeries = seriesResponse.series.slice(0, 8);

            if (topSeries.length === 0) {
              this.seriesRails.set([]);
              this.loadCollections();
              return;
            }

            forkJoin(topSeries.map((series) => this.library.getSeries(series.name))).subscribe({
              next: (seriesDetails) => {
                const rails = seriesDetails
                  .map((series) => ({
                    id: series.id,
                    name: series.name,
                    books: filterBooks(series.books),
                  }))
                  .filter((series) => series.books.length > 0);

                this.seriesRails.set(rails);
                this.loadCollections();
              },
              error: (error: unknown) => {
                this.error.set(error instanceof Error ? error.message : this.i18n.t('library.error.seriesRows'));
                this.loading.set(false);
              },
            });
          },
          error: (error: unknown) => {
            this.error.set(error instanceof Error ? error.message : this.i18n.t('library.error.series'));
            this.loading.set(false);
          },
        });
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
        const autoCollection: Collection = {
          id: AUTO_ACTIVITY_COLLECTION_ID,
          name: this.i18n.t('library.activityCollection'),
          bookIds: this.listenedBookIds(),
          updatedAt: new Date().toISOString(),
        };
        const nonAutoCollections = response.collections.filter((c) => c.id !== AUTO_ACTIVITY_COLLECTION_ID);
        const allCollections = [autoCollection, ...nonAutoCollections];

        const query = this.q.trim().toLowerCase();
        const filteredNonAuto = !query
          ? nonAutoCollections
          : nonAutoCollections.filter((collection) => collection.name.toLowerCase().includes(query));
        const filtered = [autoCollection, ...filteredNonAuto];

        this.collections.set(allCollections);
        this.filteredCollections.set(filtered);
        this.loading.set(false);
        this.scheduleRailSync();
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : this.i18n.t('library.error.collections'));
        this.loading.set(false);
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
    const token = this.auth.accessToken();
    if (!token) {
      return [];
    }

    const ids = collection.bookIds.slice(0, 3);
    const books = this.bookPool();
    const available = new Set(books.filter((book) => !!book.coverPath).map((book) => book.id));

    return ids
      .filter((id) => available.has(id))
      .map((id) => ({
        bookId: id,
        url: `/streaming/books/${id}/cover?access_token=${encodeURIComponent(token)}`,
      }));
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
    return this.latestBooks().length > 0;
  }

  hasSeriesRows(): boolean {
    return this.seriesRails().length > 0;
  }

  visibleCollections(): Collection[] {
    return this.filteredCollections();
  }

  shouldShowNoBooksState(): boolean {
    return !this.loading() && this.latestBooks().length === 0 && this.seriesRails().length === 0;
  }

  hasActiveQuery(): boolean {
    return this.q.trim().length > 0;
  }

  private bookPool(): Book[] {
    const all = [...this.latestBooks()];
    for (const series of this.seriesRails()) {
      all.push(...series.books);
    }

    const byId = new Map<string, Book>();
    for (const book of all) {
      if (!byId.has(book.id)) {
        byId.set(book.id, book);
      }
    }

    return Array.from(byId.values());
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
    const byLastListenedDesc = (a: { lastListenedAt: string | null }, b: { lastListenedAt: string | null }) => {
      const aTime = a.lastListenedAt ? Date.parse(a.lastListenedAt) : 0;
      const bTime = b.lastListenedAt ? Date.parse(b.lastListenedAt) : 0;
      return bTime - aTime;
    };

    const inProgress = progress
      .filter((item) => !item.completed && item.positionSeconds > 0)
      .sort(byLastListenedDesc)
      .map((item) => item.bookId);

    const completed = progress
      .filter((item) => item.completed)
      .sort(byLastListenedDesc)
      .map((item) => item.bookId);

    return [...new Set([...inProgress, ...completed])];
  }
}
