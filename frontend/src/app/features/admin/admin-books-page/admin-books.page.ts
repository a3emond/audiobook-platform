import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Book } from '../../../core/models/api.models';
import { AdminService } from '../../../core/services/admin.service';

@Component({
	selector: 'app-admin-books-page',
	standalone: true,
	imports: [CommonModule, RouterLink],
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

	constructor(private readonly admin: AdminService) {}

	ngOnInit(): void {
		this.loadPage(0);
	}

	loadPage(offset: number): void {
		this.loading.set(true);
		this.error.set(null);
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
