import { Component, ElementRef, HostListener, OnDestroy, OnInit, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Book } from '../../../core/models/api.models';
import { AuthService } from '../../../core/services/auth.service';
import { I18nService } from '../../../core/services/i18n.service';
import { LibraryProgressService } from '../../../core/services/library-progress.service';
import { LibraryService } from '../../../core/services/library.service';
import { coverUrlForBook } from '../../../core/utils/cover-url';
import { CoverTileComponent } from '../../../shared/ui/cover-tile/cover-tile.component';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { entryState, formatHours, nextBook, type ShelfEntry } from './shelf.utils';

@Component({
  selector: 'app-series-modal',
  standalone: true,
  imports: [RouterLink, CoverTileComponent, TranslatePipe],
  templateUrl: './series-modal.component.html',
  styleUrl: './series-modal.component.css',
})
// One shelf entry up close: the series' books in reading order on a strip,
// and the selected book's details with play and resume.
export class SeriesModalComponent implements OnInit, OnDestroy {
  readonly entry = input.required<ShelfEntry>();
  readonly closed = output<void>();

  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly library = inject(LibraryService);
  private readonly progress = inject(LibraryProgressService);
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');

  readonly selectedId = signal<string | null>(null);
  // Full records (with descriptions) fetched as books are selected.
  private readonly details = signal<Record<string, Book>>({});
  private previousOverflow = '';

  readonly selected = computed(() => {
    const books = this.entry().books;
    return books.find((book) => book.id === this.selectedId()) ?? books[0];
  });
  readonly selectedDetail = computed(() => this.details()[this.selected().id] ?? null);
  readonly backdropUrl = computed(() => coverUrlForBook(this.selected(), this.auth.accessToken()));
  readonly state = computed(() => entryState(this.entry()));
  readonly totalHours = computed(() => formatHours(this.entry().totalDuration));
  readonly percent = computed(() => Math.round(this.entry().ratio * 100));

  constructor() {
    effect(() => {
      const book = this.selected();
      if (book && !this.details()[book.id]) {
        this.library.getBook(book.id).subscribe({
          next: (full) => this.details.update((current) => ({ ...current, [full.id]: full })),
          error: () => undefined,
        });
      }
    });
  }

  ngOnInit(): void {
    const start = nextBook(this.entry(), (id) => this.progress.progressForBook(id)) ?? this.entry().books[0];
    this.selectedId.set(start?.id ?? null);
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => this.revealSelected('auto'));
  }

  ngOnDestroy(): void {
    document.body.style.overflow = this.previousOverflow;
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const books = this.entry().books;
      const index = books.findIndex((book) => book.id === this.selected().id);
      const next = books[index + (event.key === 'ArrowRight' ? 1 : -1)];
      if (next) {
        event.preventDefault();
        this.select(next);
      }
    }
  }

  select(book: Book): void {
    this.selectedId.set(book.id);
    requestAnimationFrame(() => this.revealSelected('smooth'));
  }

  close(): void {
    this.closed.emit();
  }

  coverUrl(book: Book): string {
    return coverUrlForBook(book, this.auth.accessToken());
  }

  initials(book: Book): string {
    return book.title.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'BK';
  }

  isCompleted(book: Book): boolean {
    return this.progress.isCompleted(book.id);
  }

  percentFor(book: Book): number | null {
    return this.progress.progressPercentForBook(book);
  }

  hasStarted(book: Book): boolean {
    return (this.percentFor(book) ?? 0) > 0 && !this.isCompleted(book);
  }

  hours(seconds: number): string {
    return formatHours(seconds);
  }

  remaining(book: Book): string {
    const listened = this.progress.listenedSecondsForBook(book);
    return formatHours(Math.max(0, book.duration - listened));
  }

  description(): string | null {
    const detail = this.selectedDetail();
    if (!detail) return null;
    const d = detail.description;
    const text = this.i18n.locale() === 'fr' ? d?.fr ?? d?.default ?? d?.en : d?.en ?? d?.default ?? d?.fr;
    return text?.trim() || '';
  }

  private revealSelected(behavior: ScrollBehavior): void {
    const strip = this.strip()?.nativeElement;
    const item = strip?.querySelector<HTMLElement>('[data-selected="true"]');
    if (strip && item) {
      const left = item.offsetLeft - strip.clientWidth / 2 + item.clientWidth / 2;
      strip.scrollTo({ left: Math.max(0, left), behavior });
    }
  }
}
