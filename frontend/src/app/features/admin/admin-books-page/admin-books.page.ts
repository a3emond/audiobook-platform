import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, type Params } from '@angular/router';
import { Subject, debounceTime, switchMap, catchError, of, tap } from 'rxjs';

import type {
  Book,
  BookFacets,
  BookHealthFilter,
  BookMissingField,
  BookSort,
  ListBooksResponse,
} from '../../../core/models/api.models';
import { AdminService } from '../../../core/services/admin.service';
import type { AdminBookQuery, BulkBookChanges, DuplicateBook, DuplicateGroup, MetadataReportImportResult } from '../../../core/services/admin.types';
import { AuthService } from '../../../core/services/auth.service';
import { coverUrlForBook } from '../../../core/utils/cover-url';
import { AdminBookNavService } from './admin-book-nav.service';

interface BookFilterState {
  q: string;
  author: string;
  series: string;
  genre: string;
  language: string;
  tags: string;
  missing: BookMissingField[];
  health: BookHealthFilter | '';
  sort: BookSort;
  pageSize: number;
  page: number;
}

type BulkMode = 'series' | 'genre' | 'language' | 'author' | 'addTags' | 'removeTags';

const DEFAULT_STATE: BookFilterState = {
  q: '',
  author: '',
  series: '',
  genre: '',
  language: '',
  tags: '',
  missing: [],
  health: '',
  sort: 'recent',
  pageSize: 50,
  page: 1,
};

export const MISSING_LABELS: Record<BookMissingField, string> = {
  cover: 'No cover',
  description: 'No description',
  genre: 'No genre',
  series: 'No series',
  tags: 'No tags',
};

export const HEALTH_LABELS: Record<BookHealthFilter, string> = {
  sync_error: 'Sync errors',
  dirty: 'Pending file write',
  processing: 'Processing',
  sanitize_failed: 'Sanitize failed',
};

const SORTABLE_COLUMNS: Record<string, { asc: BookSort; desc?: BookSort }> = {
  title: { asc: 'title' },
  author: { asc: 'author' },
  series: { asc: 'series' },
  duration: { asc: 'duration', desc: 'duration_desc' },
  added: { asc: 'oldest', desc: 'recent' },
};

@Component({
  selector: 'app-admin-books-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-books.page.html',
  styleUrl: './admin-books.page.css',
})
// AdminBooksPage is the catalog workbench: server-side search, facet filters,
// metadata-gap triage, sortable columns and bulk edits. Filter state lives in
// the URL so links are shareable and "back" from the editor restores the view.
export class AdminBooksPage implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly nav = inject(AdminBookNavService);
  private readonly destroyRef = inject(DestroyRef);

  readonly missingFields = Object.keys(MISSING_LABELS) as BookMissingField[];
  readonly healthFilters = Object.keys(HEALTH_LABELS) as BookHealthFilter[];
  readonly missingLabels = MISSING_LABELS;
  readonly healthLabels = HEALTH_LABELS;
  readonly pageSizes = [25, 50, 100, 200];
  readonly sortOptions: Array<{ value: BookSort; label: string }> = [
    { value: 'recent', label: 'Recently added' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'title', label: 'Title A–Z' },
    { value: 'author', label: 'Author A–Z' },
    { value: 'series', label: 'Series order' },
    { value: 'duration', label: 'Shortest' },
    { value: 'duration_desc', label: 'Longest' },
    { value: 'updated', label: 'Recently modified' },
  ];

  readonly state = signal<BookFilterState>({ ...DEFAULT_STATE });
  readonly books = signal<Book[]>([]);
  readonly total = signal(0);
  readonly facets = signal<BookFacets | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly selected = signal<Set<string>>(new Set());
  readonly showAdvanced = signal(false);

  readonly duplicatesOpen = signal(false);
  readonly duplicateGroups = signal<DuplicateGroup[] | null>(null);
  readonly duplicatesBusy = signal(false);
  // Chosen copy to keep, per group (keyed by the group's first book id).
  readonly keepChoice = signal<Record<string, string>>({});

  readonly reportOpen = signal(false);
  readonly reportBusy = signal(false);
  readonly reportPreview = signal<MetadataReportImportResult | null>(null);
  readonly reportError = signal<string | null>(null);
  reportIncludeAll = false;
  private reportFile: File | null = null;

  readonly bulkMode = signal<BulkMode | null>(null);
  readonly bulkBusy = signal(false);
  bulkValue = '';

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.state().pageSize)));
  readonly selectedCount = computed(() => this.selected().size);
  readonly allOnPageSelected = computed(
    () => this.books().length > 0 && this.books().every((book) => this.selected().has(book.id)),
  );
  readonly activeFilterCount = computed(() => {
    const s = this.state();
    return (
      [s.q, s.author, s.series, s.genre, s.language, s.tags, s.health].filter((value) => value.trim().length > 0).length +
      s.missing.length
    );
  });
  readonly pageNumbers = computed(() => {
    const current = this.state().page;
    const last = this.totalPages();
    const pages = new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last));
    return Array.from(pages).sort((a, b) => a - b);
  });

  private readonly load$ = new Subject<BookFilterState>();
  private readonly searchInput$ = new Subject<void>();
  private facetsKey = '';

  ngOnInit(): void {
    this.load$
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap((state) =>
          this.admin.searchAdminBooks(this.toQuery(state)).pipe(
            catchError((error: unknown) => {
              this.error.set(error instanceof Error ? error.message : 'Unable to load books');
              return of<ListBooksResponse | null>(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.loading.set(false);
        if (!response) {
          return;
        }
        this.books.set(response.books);
        this.total.set(response.total);
        this.nav.remember(
          response.books.map((book) => book.id),
          this.toParams(this.state()),
        );
      });

    this.searchInput$
      .pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.commit({ page: 1 }));

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const next = this.fromParams(params);
      this.state.set(next);
      this.load$.next(next);
      this.loadFacets(next);
    });
  }

  // --- filter state --------------------------------------------------------

  patch(changes: Partial<BookFilterState>): void {
    this.state.update((current) => ({ ...current, ...changes }));
  }

  onSearchInput(value: string): void {
    this.patch({ q: value });
    this.searchInput$.next();
  }

  // Writing state to the URL triggers the actual reload via queryParamMap.
  commit(changes: Partial<BookFilterState> = {}): void {
    const next = { ...this.state(), ...changes };
    if (!('page' in changes)) {
      next.page = 1;
    }
    this.state.set(next);
    void this.router.navigate([], { relativeTo: this.route, queryParams: this.toParams(next), replaceUrl: true });
  }

  toggleMissing(field: BookMissingField): void {
    const missing = this.state().missing.includes(field)
      ? this.state().missing.filter((value) => value !== field)
      : [...this.state().missing, field];
    this.commit({ missing });
  }

  toggleHealth(filter: BookHealthFilter): void {
    this.commit({ health: this.state().health === filter ? '' : filter });
  }

  filterBy(field: 'author' | 'series' | 'genre', value: string | null | undefined): void {
    if (value) {
      this.commit({ [field]: value });
    }
  }

  clearFilters(): void {
    this.commit({ ...DEFAULT_STATE, sort: this.state().sort, pageSize: this.state().pageSize });
  }

  sortBy(column: keyof typeof SORTABLE_COLUMNS): void {
    const option = SORTABLE_COLUMNS[column];
    const current = this.state().sort;
    const next = current === option.asc && option.desc ? option.desc : current === option.desc ? option.asc : option.desc ?? option.asc;
    this.commit({ sort: next });
  }

  sortIndicator(column: keyof typeof SORTABLE_COLUMNS): string {
    const option = SORTABLE_COLUMNS[column];
    const current = this.state().sort;
    if (current === option.asc) {
      return '▲';
    }
    if (current === option.desc) {
      return '▼';
    }
    return '';
  }

  goToPage(page: number): void {
    const clamped = Math.min(Math.max(1, page), this.totalPages());
    if (clamped !== this.state().page) {
      this.commit({ page: clamped });
    }
  }

  // --- selection & bulk ----------------------------------------------------

  isSelected(book: Book): boolean {
    return this.selected().has(book.id);
  }

  toggleSelected(book: Book, event?: MouseEvent): void {
    const next = new Set(this.selected());
    const shouldSelect = !next.has(book.id);

    // Shift-click selects the whole range from the last clicked row.
    if (event?.shiftKey && this.lastClickedId) {
      const ids = this.books().map((item) => item.id);
      const from = ids.indexOf(this.lastClickedId);
      const to = ids.indexOf(book.id);
      if (from >= 0 && to >= 0) {
        for (const id of ids.slice(Math.min(from, to), Math.max(from, to) + 1)) {
          if (shouldSelect) next.add(id);
          else next.delete(id);
        }
      }
    } else if (shouldSelect) {
      next.add(book.id);
    } else {
      next.delete(book.id);
    }

    this.lastClickedId = book.id;
    this.selected.set(next);
  }

  toggleSelectPage(): void {
    const next = new Set(this.selected());
    const selectAll = !this.allOnPageSelected();
    for (const book of this.books()) {
      if (selectAll) next.add(book.id);
      else next.delete(book.id);
    }
    this.selected.set(next);
  }

  clearSelection(): void {
    this.selected.set(new Set());
    this.bulkMode.set(null);
  }

  openBulk(mode: BulkMode): void {
    this.bulkMode.set(this.bulkMode() === mode ? null : mode);
    this.bulkValue = mode === 'language' ? 'en' : '';
  }

  bulkPlaceholder(): string {
    switch (this.bulkMode()) {
      case 'series':
        return 'Series name (empty clears it)';
      case 'genre':
        return 'Genre (empty clears it)';
      case 'author':
        return 'Author';
      case 'addTags':
        return 'Tags to add, comma-separated';
      case 'removeTags':
        return 'Tags to remove, comma-separated';
      default:
        return '';
    }
  }

  applyBulk(): void {
    const mode = this.bulkMode();
    const ids = Array.from(this.selected());
    if (!mode || ids.length === 0) {
      return;
    }

    const value = this.bulkValue.trim();
    const tagList = value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const changes: BulkBookChanges = {};
    switch (mode) {
      case 'series':
        changes.series = value || null;
        break;
      case 'genre':
        changes.genre = value || null;
        break;
      case 'language':
        changes.language = value === 'fr' ? 'fr' : 'en';
        break;
      case 'author':
        if (!value) return;
        changes.author = value;
        break;
      case 'addTags':
        if (tagList.length === 0) return;
        changes.addTags = tagList;
        break;
      case 'removeTags':
        if (tagList.length === 0) return;
        changes.removeTags = tagList;
        break;
    }

    this.runBulk(this.admin.bulkUpdateBooks(ids, changes), `Updated`);
  }

  bulkDelete(): void {
    const ids = Array.from(this.selected());
    if (ids.length === 0 || !confirm(`Delete ${ids.length} book(s)? This queues background delete jobs and cannot be undone.`)) {
      return;
    }
    this.runBulk(this.admin.bulkDeleteBooks(ids), 'Queued delete for');
  }

  private runBulk(request: ReturnType<AdminService['bulkUpdateBooks']>, verb: string): void {
    this.bulkBusy.set(true);
    this.error.set(null);
    this.info.set(null);

    request.subscribe({
      next: (result) => {
        this.bulkBusy.set(false);
        this.bulkMode.set(null);
        this.bulkValue = '';
        this.selected.set(new Set(result.failed.map((failure) => failure.bookId)));
        this.info.set(
          `${verb} ${result.succeeded.length} book(s)` +
            (result.failed.length > 0 ? ` — ${result.failed.length} failed and stay selected (${result.failed[0].error})` : ''),
        );
        this.refresh();
      },
      error: (error: unknown) => {
        this.bulkBusy.set(false);
        this.error.set(error instanceof Error ? error.message : 'Bulk action failed');
      },
    });
  }

  // --- duplicates -----------------------------------------------------------

  toggleDuplicates(): void {
    this.duplicatesOpen.set(!this.duplicatesOpen());
    if (this.duplicatesOpen()) {
      this.loadDuplicates();
    }
  }

  loadDuplicates(): void {
    this.duplicatesBusy.set(true);
    this.admin.listDuplicateBooks().subscribe({
      next: ({ groups }) => {
        this.duplicateGroups.set(groups);
        this.keepChoice.set(Object.fromEntries(groups.map((group) => [group.books[0].id, group.suggestedKeepId])));
        this.duplicatesBusy.set(false);
      },
      error: (error: unknown) => {
        this.duplicatesBusy.set(false);
        this.error.set(error instanceof Error ? error.message : 'Unable to look for duplicates');
      },
    });
  }

  keptId(group: DuplicateGroup): string {
    return this.keepChoice()[group.books[0].id] ?? group.suggestedKeepId;
  }

  chooseKeep(group: DuplicateGroup, bookId: string): void {
    this.keepChoice.update((current) => ({ ...current, [group.books[0].id]: bookId }));
  }

  // Progress, history and collections move to the kept copy server-side.
  resolveDuplicate(group: DuplicateGroup): void {
    const keepId = this.keptId(group);
    const removeIds = group.books.filter((book) => book.id !== keepId).map((book) => book.id);
    const kept = group.books.find((book) => book.id === keepId);
    if (!confirm(`Keep "${kept?.title}" and delete ${removeIds.length} other cop${removeIds.length === 1 ? 'y' : 'ies'}? Listening progress moves to the kept copy.`)) {
      return;
    }

    this.duplicatesBusy.set(true);
    this.admin.resolveDuplicateBooks(keepId, removeIds).subscribe({
      next: (result) => {
        this.duplicateGroups.update((groups) => (groups ?? []).filter((item) => item !== group));
        this.duplicatesBusy.set(false);
        this.info.set(`Removed ${result.removed} duplicate(s)${result.progressMoved > 0 ? `, moved ${result.progressMoved} progress record(s)` : ''}.`);
        this.refresh();
      },
      error: (error: unknown) => {
        this.duplicatesBusy.set(false);
        this.error.set(error instanceof Error ? error.message : 'Unable to remove duplicates');
      },
    });
  }

  duplicateMeta(book: DuplicateBook): string {
    const parts = [this.formatDuration(book.duration)];
    if (book.series) parts.push(`${book.series}${book.seriesIndex !== null ? ' #' + book.seriesIndex : ''}`);
    if (book.createdAt) parts.push(`added ${book.createdAt.slice(0, 10)}`);
    return parts.join(' · ');
  }

  duplicateListening(book: DuplicateBook): string {
    if (book.finishedBy > 0) return `finished by ${book.finishedBy}`;
    if (book.listeners > 0) return `${book.listeners} listening · ${book.bestPercent}%`;
    return 'no listening progress';
  }

  duplicateCover(book: DuplicateBook): string {
    return coverUrlForBook({ id: book.id, coverPath: book.coverPath, version: book.version }, this.auth.accessToken());
  }

  // --- metadata report round-trip ------------------------------------------

  downloadReport(): void {
    this.reportBusy.set(true);
    this.reportError.set(null);
    this.admin
      .exportMetadataReport({ all: this.reportIncludeAll, language: this.state().language || undefined })
      .subscribe({
        next: (report) => {
          this.reportBusy.set(false);
          const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `metadata-report-${new Date().toISOString().slice(0, 10)}.json`;
          link.click();
          URL.revokeObjectURL(url);
        },
        error: (error: unknown) => {
          this.reportBusy.set(false);
          this.reportError.set(error instanceof Error ? error.message : 'Unable to build report');
        },
      });
  }

  // Uploading always previews first; nothing changes until "Apply".
  onReportPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.reportFile = input.files?.[0] ?? null;
    input.value = '';
    if (this.reportFile) {
      this.sendReport(true);
    }
  }

  applyReport(): void {
    if (this.reportFile && confirm(`Apply ${this.reportPreview()?.items.filter((item) => !item.error).length ?? 0} book update(s)?`)) {
      this.sendReport(false);
    }
  }

  cancelReport(): void {
    this.reportFile = null;
    this.reportPreview.set(null);
    this.reportError.set(null);
  }

  formatReportValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '∅';
    if (Array.isArray(value)) return value.join(', ') || '∅';
    const text = String(value);
    return text.length > 160 ? `${text.slice(0, 157)}…` : text;
  }

  private sendReport(dryRun: boolean): void {
    if (!this.reportFile) return;
    this.reportBusy.set(true);
    this.reportError.set(null);
    this.admin.importMetadataReport(this.reportFile, dryRun).subscribe({
      next: (result) => {
        this.reportBusy.set(false);
        if (dryRun) {
          this.reportPreview.set(result);
          return;
        }
        this.cancelReport();
        this.info.set(
          `Report applied: ${result.applied} book(s) updated, ${result.unchanged} unchanged, ${result.errors} error(s).` +
            (result.jobsQueued ? ' File tag writes are queued for the worker.' : ''),
        );
        this.refresh();
      },
      error: (error: unknown) => {
        this.reportBusy.set(false);
        const message = error instanceof Error ? error.message : 'Unable to read report';
        this.reportError.set(
          message === 'report_format_invalid'
            ? 'This file is not a metadata report (the "format" field is missing or changed).'
            : message === 'report_json_invalid'
              ? 'The file is not valid JSON.'
              : message,
        );
      },
    });
  }

  // --- row actions ---------------------------------------------------------

  deleteBook(book: Book): void {
    if (!confirm(`Delete "${book.title}"? This queues a background delete job.`)) {
      return;
    }

    this.admin.deleteBook(book.id).subscribe({
      next: (result) => {
        this.books.update((items) => items.filter((item) => item.id !== book.id));
        this.total.update((value) => Math.max(0, value - 1));
        this.info.set(`Delete job queued: ${result.jobId}`);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Unable to queue delete');
      },
    });
  }

  refresh(): void {
    this.load$.next(this.state());
    this.facetsKey = '';
    this.loadFacets(this.state());
  }

  // --- view helpers --------------------------------------------------------

  coverUrl(book: Book): string {
    return coverUrlForBook(book, this.auth.accessToken());
  }

  bookGaps(book: Book): string[] {
    const gaps: string[] = [];
    if (!book.coverPath) gaps.push('cover');
    if (!book.description?.default && !book.description?.en && !book.description?.fr) gaps.push('description');
    if (!book.genre) gaps.push('genre');
    if (!book.tags || book.tags.length === 0) gaps.push('tags');
    return gaps;
  }

  healthBadge(book: Book): { label: string; tone: 'warn' | 'danger' } | null {
    const extra = book as Book & { fileSync?: { status?: string }; processingState?: string };
    if (extra.fileSync?.status === 'error') return { label: 'sync error', tone: 'danger' };
    if (extra.processingState === 'sanitize_failed') return { label: 'sanitize failed', tone: 'danger' };
    if (extra.processingState === 'pending_sanitize' || extra.processingState === 'sanitizing') return { label: 'processing', tone: 'warn' };
    if (extra.fileSync?.status === 'dirty' || extra.fileSync?.status === 'writing') return { label: 'writing', tone: 'warn' };
    return null;
  }

  formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return '—';
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
  }

  rangeLabel(): string {
    const { page, pageSize } = this.state();
    if (this.total() === 0) {
      return '0 books';
    }
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(this.total(), from + this.books().length - 1);
    return `${from}–${to} of ${this.total()}`;
  }

  // --- url <-> state -------------------------------------------------------

  private lastClickedId: string | null = null;

  private loadFacets(state: BookFilterState): void {
    // Facets only depend on the language scope, so avoid refetching per keystroke.
    const key = state.language;
    if (key === this.facetsKey && this.facets()) {
      return;
    }
    this.facetsKey = key;
    this.admin.getBookFacets({ language: state.language || undefined }).subscribe({
      next: (facets) => this.facets.set(facets),
      error: () => this.facets.set(null),
    });
  }

  private toQuery(state: BookFilterState): AdminBookQuery {
    return {
      q: state.q.trim() || undefined,
      author: state.author.trim() || undefined,
      series: state.series.trim() || undefined,
      genre: state.genre || undefined,
      language: state.language || undefined,
      tags: state.tags || undefined,
      missing: state.missing.length > 0 ? state.missing.join(',') : undefined,
      health: state.health || undefined,
      sort: state.sort,
      limit: state.pageSize,
      offset: (state.page - 1) * state.pageSize,
    };
  }

  private toParams(state: BookFilterState): Params {
    const params: Params = {};
    if (state.q.trim()) params['q'] = state.q.trim();
    if (state.author.trim()) params['author'] = state.author.trim();
    if (state.series.trim()) params['series'] = state.series.trim();
    if (state.genre) params['genre'] = state.genre;
    if (state.language) params['language'] = state.language;
    if (state.tags) params['tags'] = state.tags;
    if (state.missing.length > 0) params['missing'] = state.missing.join(',');
    if (state.health) params['health'] = state.health;
    if (state.sort !== DEFAULT_STATE.sort) params['sort'] = state.sort;
    if (state.pageSize !== DEFAULT_STATE.pageSize) params['size'] = state.pageSize;
    if (state.page > 1) params['page'] = state.page;
    return params;
  }

  private fromParams(params: { get(name: string): string | null }): BookFilterState {
    const sort = params.get('sort') as BookSort | null;
    const size = Number(params.get('size'));
    const page = Number(params.get('page'));
    const health = params.get('health') as BookHealthFilter | null;
    return {
      q: params.get('q') ?? '',
      author: params.get('author') ?? '',
      series: params.get('series') ?? '',
      genre: params.get('genre') ?? '',
      language: params.get('language') ?? '',
      tags: params.get('tags') ?? '',
      missing: (params.get('missing') ?? '')
        .split(',')
        .filter((value): value is BookMissingField => value in MISSING_LABELS),
      health: health && health in HEALTH_LABELS ? health : '',
      sort: sort && this.sortOptions.some((option) => option.value === sort) ? sort : DEFAULT_STATE.sort,
      pageSize: this.pageSizes.includes(size) ? size : DEFAULT_STATE.pageSize,
      page: Number.isInteger(page) && page > 0 ? page : 1,
    };
  }
}
