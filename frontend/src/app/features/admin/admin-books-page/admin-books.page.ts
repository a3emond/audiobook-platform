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
