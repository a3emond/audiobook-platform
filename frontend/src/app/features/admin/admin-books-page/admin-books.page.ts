import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import type { Book } from '../../../core/models/api.models';
import { AdminService } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-books-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-books.page.html',
  styleUrl: './admin-books.page.css',
})
// Main UI/state logic for this standalone view component.
export class AdminBooksPage implements OnInit {
  readonly pageSize = 50;

  readonly books = signal<Book[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly offset = signal(0);
  readonly total = signal(0);
  readonly hasMore = signal(false);
  readonly info = signal<string | null>(null);
  readonly deletingBookId = signal<string | null>(null);

  filterTitle = '';
  filterAuthor = '';
  filterSeries = '';

  constructor(private readonly admin: AdminService) {}

  ngOnInit(): void {
    this.loadPage(0);
  }

  loadPage(offset: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.info.set(null);
    this.admin.listAdminBooks(this.pageSize, offset).subscribe({
      next: (response) => {
        this.books.set(response.books);
        this.total.set(response.total);
        this.hasMore.set(response.hasMore);
        this.offset.set(offset);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Unable to load admin books');
        this.loading.set(false);
      },
    });
  }

  filteredBooks(): Book[] {
    const title = this.filterTitle.trim().toLowerCase();
    const author = this.filterAuthor.trim().toLowerCase();
    const series = this.filterSeries.trim().toLowerCase();

    return this.books()
      .filter((book) => {
        if (title && !book.title.toLowerCase().includes(title)) {
          return false;
        }

        if (author && !(book.author ?? '').toLowerCase().includes(author)) {
          return false;
        }

        if (series && !(book.series ?? '').toLowerCase().includes(series)) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const leftSeries = (left.series ?? '').toLowerCase();
        const rightSeries = (right.series ?? '').toLowerCase();
        if (leftSeries !== rightSeries) {
          return leftSeries.localeCompare(rightSeries);
        }

        const leftIndex = left.seriesIndex ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = right.seriesIndex ?? Number.MAX_SAFE_INTEGER;
        if (leftIndex !== rightIndex) {
          return leftIndex - rightIndex;
        }

        return left.title.localeCompare(right.title);
      });
  }

  hasFilters(): boolean {
    return (
      this.filterTitle.trim().length > 0 ||
      this.filterAuthor.trim().length > 0 ||
      this.filterSeries.trim().length > 0
    );
  }

  clearFilters(): void {
    this.filterTitle = '';
    this.filterAuthor = '';
    this.filterSeries = '';
  }

  seriesIndexLabel(book: Book): string {
    return typeof book.seriesIndex === 'number' ? String(book.seriesIndex) : '-';
  }

  deleteBook(book: Book): void {
    const confirmed = confirm(`Delete "${book.title}"? This queues a background delete job.`);
    if (!confirmed) {
      return;
    }

    this.deletingBookId.set(book.id);
    this.error.set(null);
    this.info.set(null);

    this.admin.deleteBook(book.id).subscribe({
      next: (result) => {
        this.deletingBookId.set(null);
        this.books.update((items) => items.filter((item) => item.id !== book.id));
        this.total.update((value) => Math.max(0, value - 1));
        this.info.set(`Delete job queued: ${result.jobId}`);
      },
      error: (error: unknown) => {
        this.deletingBookId.set(null);
        this.error.set(error instanceof Error ? error.message : 'Unable to queue delete');
      },
    });
  }

  prevPage(): void {
    const prev = Math.max(0, this.offset() - this.pageSize);
    this.loadPage(prev);
  }

  nextPage(): void {
    if (this.hasMore()) {
      this.loadPage(this.offset() + this.pageSize);
    }
  }

  currentPage(): number {
    return Math.floor(this.offset() / this.pageSize) + 1;
  }

  totalPages(): number {
    return Math.ceil(this.total() / this.pageSize);
  }
}
