import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import type { PaginationMeta } from '../../../core/models/api.models';
import { LibraryService } from '../../../core/services/library.service';
import { StatsService } from '../../../core/services/stats.service';
import type { HistoryBookRow } from './history-page.types';
import {
	filterHistoryRows,
	formatHistoryDuration,
	groupSessionsByBook,
	historyAuthor,
	historyTitle,
} from './history-page.utils';

@Component({
	selector: 'app-history-page',
	standalone: true,
	imports: [CommonModule, FormsModule, RouterLink],
	templateUrl: './history.page.html',
	styleUrl: './history.page.css',
})
// HistoryPage composes listening sessions and catalog metadata into book-level
// history rows with client-side filtering.
export class HistoryPage implements OnInit {
	private readonly stats = inject(StatsService);
	private readonly library = inject(LibraryService);

	query = '';
	readonly rows = signal<HistoryBookRow[]>([]);
	readonly filteredRows = signal<HistoryBookRow[]>([]);
	readonly meta = signal<PaginationMeta | null>(null);
	readonly loading = signal(false);
	readonly error = signal<string | null>(null);

	private filterTimeout?: ReturnType<typeof setTimeout>;

	ngOnInit(): void {
		this.reload();
	}

	onFilterChange(): void {
		if (this.filterTimeout) {
			clearTimeout(this.filterTimeout);
		}

		this.filterTimeout = setTimeout(() => this.applyFilter(), 180);
	}

	clearFilter(): void {
		if (!this.hasActiveFilter()) {
			return;
		}

		this.query = '';
		this.applyFilter();
	}

	hasActiveFilter(): boolean {
		return this.query.trim().length > 0;
	}

	reload(): void {
		this.loading.set(true);
		this.error.set(null);

		forkJoin({
			response: this.stats.listSessions({
				limit: 50,
				offset: 0,
			}),
			booksResponse: this.library.listBooks({ limit: 300, offset: 0 }),
		}).subscribe({
			next: ({ response, booksResponse }) => {
				const byId = new Map(booksResponse.books.map((book) => [book.id, book]));
				this.rows.set(groupSessionsByBook(response.sessions, byId));
				this.meta.set({
					total: response.total,
					limit: response.limit,
					offset: response.offset,
					hasMore: response.hasMore,
				});
				this.applyFilter();
				this.loading.set(false);
			},
			error: (error: unknown) => {
				this.error.set(error instanceof Error ? error.message : 'Unable to load history');
				this.loading.set(false);
			},
		});
	}

	loadMore(): void {
		const m = this.meta();
		if (!m?.hasMore || this.loading()) {
			return;
		}

		const nextOffset = m.offset + m.limit;
		this.loading.set(true);

		forkJoin({
			response: this.stats.listSessions({ limit: m.limit, offset: nextOffset }),
			booksResponse: this.library.listBooks({ limit: 300, offset: 0 }),
		}).subscribe({
			next: ({ response, booksResponse }) => {
				const byId = new Map(booksResponse.books.map((book) => [book.id, book]));
				const newRows = groupSessionsByBook(response.sessions, byId);
				this.rows.update((existing) => [...existing, ...newRows]);
				this.meta.set({
					total: response.total,
					limit: response.limit,
					offset: response.offset,
					hasMore: response.hasMore,
				});
				this.applyFilter();
				this.loading.set(false);
			},
			error: (error: unknown) => {
				this.error.set(error instanceof Error ? error.message : 'Unable to load history');
				this.loading.set(false);
			},
		});
	}

	applyFilter(): void {
		this.filteredRows.set(filterHistoryRows(this.rows(), this.query));
	}

	displayTitle(item: HistoryBookRow): string {
		return historyTitle(item);
	}

	displayAuthor(item: HistoryBookRow): string {
		return historyAuthor(item);
	}

	formatDuration(totalSeconds: number): string {
		return formatHistoryDuration(totalSeconds);
	}
}
