import { Component, computed, inject, input, output } from '@angular/core';

import type { Book } from '../../../core/models/api.models';
import { AuthService } from '../../../core/services/auth.service';
import { LibraryProgressService } from '../../../core/services/library-progress.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { coverUrlForBook } from '../../../core/utils/cover-url';
import { entryState, formatHours, nextBook, type ShelfEntry } from './shelf.utils';

interface FanCover {
  id: string;
  url: string;
  initials: string;
}

@Component({
  selector: 'app-shelf-card',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './shelf-card.component.html',
  styleUrl: './shelf-card.component.css',
})
// A series as a fan of its covers (a standalone book as a single cover).
export class ShelfCardComponent {
  readonly entry = input.required<ShelfEntry>();
  readonly opened = output<ShelfEntry>();

  private readonly auth = inject(AuthService);
  private readonly progress = inject(LibraryProgressService);

  readonly state = computed(() => entryState(this.entry()));
  readonly percent = computed(() => Math.round(this.entry().ratio * 100));
  readonly hours = computed(() => formatHours(this.entry().totalDuration));

  // Up to three covers, the book to pick up next on top.
  readonly covers = computed<FanCover[]>(() => {
    const entry = this.entry();
    const token = this.auth.accessToken();
    const top = nextBook(entry, (id) => this.progress.progressForBook(id)) ?? entry.books[0];
    const ordered: Book[] = [top, ...entry.books.filter((book) => book.id !== top.id)];
    return ordered.slice(0, 3).map((book) => ({
      id: book.id,
      url: coverUrlForBook(book, token),
      initials: book.title.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'BK',
    }));
  });
}
