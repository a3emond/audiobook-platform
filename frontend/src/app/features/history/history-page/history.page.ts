import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import type { Book, ListeningSession, PaginationMeta } from '../../../core/models/api.models';
import { LibraryService } from '../../../core/services/library.service';
import { StatsService } from '../../../core/services/stats.service';

interface HistoryBookRow {
	bookId: string;
  book: Book | null;
	sessions: number;
	totalListenedSeconds: number;
	averageSessionSeconds: number;
	lastListenedAt: string | null;
}

@Component({
	selector: 'app-history-page',
	standalone: true,
	imports: [CommonModule, FormsModule, RouterLink],
	templateUrl: './history.page.html',
	styleUrl: './history.page.css',
})
// Main UI/state logic for this standalone view component.
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

		this.stats
			.listSessions({
				limit: 50,
				offset: 0,
			})
			.subscribe({
				next: (response) => {
					this.library.listBooks({ limit: 300, offset: 0 }).subscribe({
						next: (booksResponse) => {
							const byId = new Map(booksResponse.books.map((book) => [book.id, book]));
							this.rows.set(this.groupByBook(response.sessions, byId));
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
							this.error.set(error instanceof Error ? error.message : 'Unable to load books');
							this.loading.set(false);
						},
					});
				},
				error: (error: unknown) => {
					this.error.set(error instanceof Error ? error.message : 'Unable to load sessions');
					this.loading.set(false);
				},
			});
	}

	applyFilter(): void {
		const query = this.query.trim().toLowerCase();
		if (!query) {
			this.filteredRows.set(this.rows());
			return;
		}

		this.filteredRows.set(
			this.rows().filter((item) => {
				const title = item.book?.title ?? '';
				const author = item.book?.author ?? '';
				const haystack = `${title} ${author} ${item.bookId}`.toLowerCase();
				return haystack.includes(query);
			}),
		);
	}

	displayTitle(item: HistoryBookRow): string {
		return item.book?.title ?? `Book ${item.bookId.slice(0, 8)}`;
	}

	displayAuthor(item: HistoryBookRow): string {
		return item.book?.author ?? 'Unknown author';
	}

	formatDuration(totalSeconds: number): string {
		const value = Math.max(0, Math.floor(totalSeconds));
		const hours = Math.floor(value / 3600);
		const minutes = Math.floor((value % 3600) / 60);
		const seconds = value % 60;

		if (hours > 0) {
			return `${hours}h ${minutes}m ${seconds}s`;
		}

		if (minutes > 0) {
			return `${minutes}m ${seconds}s`;
		}

		return `${seconds}s`;
	}

	private groupByBook(sessions: ListeningSession[], booksById: Map<string, Book>): HistoryBookRow[] {
		const grouped = new Map<string, ListeningSession[]>();

		for (const session of sessions) {
			const bucket = grouped.get(session.bookId);
			if (bucket) {
				bucket.push(session);
			} else {
				grouped.set(session.bookId, [session]);
			}
		}

		const rows: HistoryBookRow[] = [];
		for (const [bookId, bookSessions] of grouped.entries()) {
			const totalListenedSeconds = bookSessions.reduce((sum, s) => sum + (s.listenedSeconds || 0), 0);
			const sessionsCount = bookSessions.length;
			const averageSessionSeconds = sessionsCount > 0 ? Math.floor(totalListenedSeconds / sessionsCount) : 0;
			const lastListenedAt = bookSessions
				.map((s) => s.endedAt)
				.filter((date): date is string => !!date)
				.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

			rows.push({
				bookId,
				book: booksById.get(bookId) ?? null,
				sessions: sessionsCount,
				totalListenedSeconds,
				averageSessionSeconds,
				lastListenedAt,
			});
		}

		return rows.sort((a, b) => {
			const aTime = a.lastListenedAt ? Date.parse(a.lastListenedAt) : 0;
			const bTime = b.lastListenedAt ? Date.parse(b.lastListenedAt) : 0;
			return bTime - aTime;
		});
	}
}
