import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Book } from '../../core/models/api.models';
import { AdminService } from '../../core/services/admin.service';

@Component({
	selector: 'app-admin-books-page',
	standalone: true,
	imports: [CommonModule, RouterLink],
	template: `
		<section class="admin-page page-shell">
			<h1>Admin Books</h1>
			<p *ngIf="loading()">Loading books...</p>
			<p *ngIf="error()" class="error">{{ error() }}</p>

			<table *ngIf="books().length > 0" class="admin-table">
				<thead>
					<tr><th>Title</th><th>Author</th><th>Series</th><th>Duration (s)</th><th>Actions</th></tr>
				</thead>
				<tbody>
					<tr *ngFor="let book of books()">
						<td>{{ book.title }}</td>
						<td>{{ book.author }}</td>
						<td>{{ book.series || '-' }}</td>
						<td>{{ book.duration }}</td>
						<td><a [routerLink]="['/admin/books', book.id]">Edit</a></td>
					</tr>
				</tbody>
			</table>
		</section>
	`,
	styles: [
		`
			.admin-page { display: grid; gap: 0.9rem; }
			.error { color: var(--color-danger); }
			.admin-table { width: 100%; border-collapse: collapse; background: var(--color-surface); }
			.admin-table th, .admin-table td { border: 1px solid var(--color-border); padding: 0.45rem; text-align: left; }
			.admin-table th { background: #1a1a1a; color: var(--color-text-muted); }
		`,
	],
})
export class AdminBooksPage implements OnInit {
	readonly books = signal<Book[]>([]);
	readonly loading = signal(false);
	readonly error = signal<string | null>(null);

	constructor(private readonly admin: AdminService) {}

	ngOnInit(): void {
		this.loading.set(true);
		this.admin.listAdminBooks(50, 0).subscribe({
			next: (response) => {
				this.books.set(response.books);
				this.loading.set(false);
			},
			error: (error: unknown) => {
				this.error.set(error instanceof Error ? error.message : 'Unable to load admin books');
				this.loading.set(false);
			},
		});
	}
}
