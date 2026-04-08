import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import type { Book, ListeningSession, PaginationMeta } from '../../core/models/api.models';
import { LibraryService } from '../../core/services/library.service';
import { StatsService } from '../../core/services/stats.service';

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
	template: `
		<section class="history-page page-shell">
			<header class="page-head">
				<h1 class="hero-title">History</h1>
				<p class="hero-subtitle">Recently played sessions with quick resume access.</p>
			</header>

			<section class="filters card">
				<label>
					<span>Filter</span>
					<input
						name="query"
						[(ngModel)]="query"
						(ngModelChange)="onFilterChange()"
						placeholder="Filter by title, author, or book id"
					/>
				</label>
				<button type="button" class="clear-filter" (click)="clearFilter()" [disabled]="!hasActiveFilter()">Clear</button>
			</section>

			<p *ngIf="loading()" class="text-muted">Loading sessions...</p>
			<p *ngIf="error()" class="text-error">{{ error() }}</p>

			<section class="table-wrap card" *ngIf="!loading() && filteredRows().length > 0">
				<table class="history-table">
					<thead>
						<tr>
							<th>Book</th>
							<th>Author</th>
							<th>Sessions</th>
							<th>Total listened</th>
							<th>Avg session</th>
							<th>Last listened</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						<tr *ngFor="let row of filteredRows()">
							<td>{{ displayTitle(row) }}</td>
							<td>{{ displayAuthor(row) }}</td>
							<td>{{ row.sessions }}</td>
							<td>{{ formatDuration(row.totalListenedSeconds) }}</td>
							<td>{{ formatDuration(row.averageSessionSeconds) }}</td>
							<td>{{ row.lastListenedAt ? (row.lastListenedAt | date: 'medium') : 'N/A' }}</td>
							<td><a class="resume" [routerLink]="['/player', row.bookId]">Open</a></td>
						</tr>
					</tbody>
				</table>
			</section>

			<section *ngIf="!loading() && !error() && filteredRows().length === 0" class="empty card">
				<h3>{{ rows().length === 0 ? 'No listening history yet' : 'No books matched this filter' }}</h3>
				<p class="text-muted">
					{{ rows().length === 0 ? 'Play a book to build your listening history here.' : 'Try a broader query or clear the filter.' }}
				</p>
				<div class="empty-actions" *ngIf="rows().length > 0">
					<button type="button" class="btn btn-secondary" (click)="clearFilter()">Clear filter</button>
				</div>
			</section>

			<footer *ngIf="meta() as m" class="meta">
				<span>Total {{ m.total }}</span>
				<span>Limit {{ m.limit }}</span>
				<span>Offset {{ m.offset }}</span>
				<span>Has more {{ m.hasMore }}</span>
			</footer>
		</section>
	`,
	styles: [
		`
			.history-page {
				display: grid;
				gap: 0.95rem;
			}

			.page-head {
				display: grid;
				gap: 0.25rem;
			}

			.filters {
				display: flex;
				align-items: end;
				gap: 0.7rem;
			}

			.filters label {
				flex: 1;
			}

			.clear-filter {
				border: 1px solid #d8e2ee;
				border-radius: 0.55rem;
				background: #fff;
				color: #0f2942;
				font-size: 0.82rem;
				font-weight: 700;
				padding: 0.5rem 0.72rem;
			}

			.clear-filter:disabled {
				opacity: 0.45;
			}

			.sessions {
				display: grid;
				gap: 0.65rem;
			}

			.table-wrap {
				overflow: auto;
				padding: 0;
			}

			.history-table {
				width: 100%;
				border-collapse: collapse;
				min-width: 720px;
			}

			.history-table thead th {
				text-align: left;
				font-size: 0.78rem;
				color: #5b6b81;
				font-weight: 700;
				padding: 0.6rem 0.75rem;
				border-bottom: 1px solid #dde5ef;
				background: #f8fbff;
				position: sticky;
				top: 0;
				z-index: 1;
			}

			.history-table tbody td {
				padding: 0.7rem 0.75rem;
				border-bottom: 1px solid #edf2f7;
				font-size: 0.86rem;
				color: #1f2937;
				vertical-align: middle;
			}

			.history-table tbody tr:hover {
				background: #fafcff;
			}

			.session {
				display: grid;
				grid-template-columns: 72px 1fr auto;
				gap: 0.75rem;
				align-items: center;
				padding: 0.65rem;
			}

			.cover-link {
				position: relative;
				display: block;
				width: 72px;
				height: 72px;
			}

			.cover {
				width: 100%;
				height: 100%;
				object-fit: cover;
				border-radius: 0.55rem;
			}

			.cover.fallback {
				display: grid;
				place-items: center;
				background: linear-gradient(135deg, #1d4ed8, #0f172a 78%);
				color: #fff;
				font-weight: 700;
				border-radius: 0.55rem;
			}

			.cover-completed-overlay {
				position: absolute;
				inset: 0;
				border-radius: 0.55rem;
				background: rgb(2 6 23 / 0.5);
				color: #e2fbe8;
				display: grid;
				place-content: center;
				gap: 0.1rem;
				text-align: center;
				font-size: 0.55rem;
				font-weight: 800;
			}

			.cover-completed-overlay .check {
				color: #22c55e;
				font-size: 0.95rem;
				line-height: 1;
			}

			.session-main h3 {
				margin: 0;
				font-size: 1rem;
			}

			.author {
				margin: 0.15rem 0 0.45rem;
				color: var(--color-text-muted);
			}

			.meta-row {
				display: flex;
				gap: 0.9rem;
				flex-wrap: wrap;
				font-size: 0.84rem;
				color: #334155;
			}

			.resume {
				padding: 0.36rem 0.62rem;
				border-radius: 999px;
				background: #eef6ff;
				color: #0b3a66;
				border: 1px solid #b8d2ef;
				text-decoration: none;
				font-size: 0.78rem;
				font-weight: 700;
			}

			.meta {
				display: flex;
				gap: 1rem;
				flex-wrap: wrap;
				margin-top: 0.2rem;
				color: #475569;
				font-size: 0.86rem;
			}

			.empty {
				display: grid;
				gap: 0.45rem;
				padding: 1rem;
				border: 1px dashed #d5deeb;
				background: linear-gradient(165deg, #fff, #f8fbff);
			}

			.empty h3 {
				margin: 0;
				font-size: 1rem;
			}

			.empty-actions {
				display: flex;
				justify-content: flex-start;
			}

			@media (max-width: 720px) {
				.table-wrap {
					margin-inline: -0.35rem;
				}

				.session {
					grid-template-columns: 64px 1fr;
				}

				.cover-link {
					width: 64px;
					height: 64px;
				}

				.resume {
					grid-column: 1 / -1;
					justify-self: start;
				}
			}
		`,
	],
})
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
