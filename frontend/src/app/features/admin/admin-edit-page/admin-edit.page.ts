import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import type { Book } from '../../../core/models/api.models';
import { AdminService } from '../../../core/services/admin.service';
import { prepareCoverImageFile, prepareCoverImageFromUrl } from '../../../core/utils/image-upload';

interface EditableChapter {
	id: number;
	title: string;
	start: number;
	end: number;
}

@Component({
	selector: 'app-admin-edit-page',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './admin-edit.page.html',
	styleUrl: './admin-edit.page.css',
})
// Main UI/state logic for this standalone view component.
export class AdminEditPage implements OnInit {
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly admin = inject(AdminService);

	readonly loading = signal(false);
	readonly savingMetadata = signal(false);
	readonly savingChapters = signal(false);
	readonly error = signal<string | null>(null);
	readonly success = signal<string | null>(null);
	readonly chapterValidationError = signal<string | null>(null);
	readonly selectedCoverFile = signal<File | null>(null);

	private bookId = '';
	private currentBook: Book | null = null;

	title = '';
	author = '';
	series = '';
	seriesIndex: number | null = null;
	genre = '';
	language: 'en' | 'fr' = 'en';
	tagsRaw = '';
	descriptionDefault = '';
	coverUrlInput = '';
	chapterRows: EditableChapter[] = [];
	private chapterRowCounter = 1;

	ngOnInit(): void {
		const bookId = this.route.snapshot.paramMap.get('bookId');
		if (!bookId) {
			this.error.set('Missing book id');
			return;
		}
		this.bookId = bookId;
		this.loadBook();
	}

	saveMetadata(): void {
		if (!this.bookId) {
			return;
		}

		this.savingMetadata.set(true);
		this.error.set(null);
		this.success.set(null);

		this.admin
			.updateBookMetadata(this.bookId, {
				title: this.title.trim() || undefined,
				author: this.author.trim() || undefined,
				series: this.series.trim() || null,
				seriesIndex: this.seriesIndex,
				language: this.language,
				genre: this.genre.trim() || null,
				tags: this.tagsRaw
					.split(',')
					.map((v) => v.trim())
					.filter(Boolean),
				description: {
					default: this.descriptionDefault.trim() || null,
				},
			})
			.subscribe({
				next: (book) => {
					this.currentBook = book;
					this.success.set('Metadata saved');
					this.savingMetadata.set(false);
				},
				error: (error: unknown) => {
					this.error.set(error instanceof Error ? error.message : 'Unable to save metadata');
					this.savingMetadata.set(false);
				},
			});
	}

	saveChapters(): void {
		if (!this.bookId) {
			return;
		}

		const validationError = this.validateChapterRows();
		if (validationError) {
			this.chapterValidationError.set(validationError);
			this.error.set(validationError);
			return;
		}

		const chapters = this.chapterRows.map((chapter, index) => ({
			index,
			title: chapter.title.trim(),
			start: Number(chapter.start),
			end: Number(chapter.end),
		}));

		this.savingChapters.set(true);
		this.error.set(null);
		this.success.set(null);
		this.chapterValidationError.set(null);

		this.admin.updateBookChapters(this.bookId, { chapters }).subscribe({
			next: (book) => {
				this.currentBook = book;
				this.success.set('Chapters saved');
				this.savingChapters.set(false);
			},
			error: (error: unknown) => {
				this.error.set(error instanceof Error ? error.message : 'Unable to save chapters');
				this.savingChapters.set(false);
			},
		});
	}

	extractCover(): void {
		if (!this.bookId) {
			return;
		}

		this.admin.extractBookCover(this.bookId).subscribe({
			next: (result) => this.success.set(`Cover extraction queued: ${result.jobId}`),
			error: (error: unknown) => {
				this.error.set(error instanceof Error ? error.message : 'Unable to queue cover extraction');
			},
		});
	}

	async onCoverPicked(event: Event): Promise<void> {
		const target = event.target as HTMLInputElement | null;
		const file = target?.files?.[0] ?? null;

		if (!file) {
			this.selectedCoverFile.set(null);
			return;
		}

		this.error.set(null);
		try {
			const prepared = await prepareCoverImageFile(file);
			this.selectedCoverFile.set(prepared);
		} catch (error: unknown) {
			this.selectedCoverFile.set(null);
			this.error.set(error instanceof Error ? error.message : 'Invalid cover image');
		}
	}

	async useCoverUrl(): Promise<void> {
		const value = this.coverUrlInput.trim();
		if (!value) {
			this.error.set('Please provide an image URL');
			return;
		}

		this.error.set(null);
		try {
			const prepared = await prepareCoverImageFromUrl(value);
			this.selectedCoverFile.set(prepared);
			this.success.set('Cover image downloaded and prepared. You can now upload it.');
		} catch (error: unknown) {
			this.selectedCoverFile.set(null);
			this.error.set(error instanceof Error ? error.message : 'Unable to load image from URL');
		}
	}

	replaceCover(): void {
		if (!this.bookId) {
			return;
		}

		const coverFile = this.selectedCoverFile();
		if (!coverFile) {
			this.error.set('Please pick a cover image first');
			return;
		}

		this.admin.replaceBookCover(this.bookId, coverFile).subscribe({
			next: (result) => {
				this.success.set(`Cover replacement queued: ${result.jobId}`);
				this.selectedCoverFile.set(null);
			},
			error: (error: unknown) => {
				this.error.set(error instanceof Error ? error.message : 'Unable to queue cover replacement');
			},
		});
	}

	deleteBook(): void {
		if (!this.bookId) {
			return;
		}

		const confirmed = confirm('Delete this book? This queues a background delete job.');
		if (!confirmed) {
			return;
		}

		this.admin.deleteBook(this.bookId).subscribe({
			next: (result) => {
				this.success.set(`Delete job queued: ${result.jobId}`);
				void this.router.navigateByUrl('/admin/books');
			},
			error: (error: unknown) => {
				this.error.set(error instanceof Error ? error.message : 'Unable to queue delete');
			},
		});
	}

	private loadBook(): void {
		this.loading.set(true);
		this.error.set(null);

		this.admin.getBook(this.bookId).subscribe({
			next: (book) => {
				this.currentBook = book;
				this.hydrateForm(book);
				this.loading.set(false);
			},
			error: (error: unknown) => {
				this.error.set(error instanceof Error ? error.message : 'Unable to load book');
				this.loading.set(false);
			},
		});
	}

	private hydrateForm(book: Book): void {
		this.title = book.title ?? '';
		this.author = book.author ?? '';
		this.series = book.series ?? '';
		this.seriesIndex = book.seriesIndex ?? null;
		this.genre = book.genre ?? '';
		this.language = book.language === 'fr' ? 'fr' : 'en';
		this.tagsRaw = (book.tags ?? []).join(', ');
		this.descriptionDefault = book.description?.default ?? '';
		this.chapterRows = (book.chapters ?? []).map((chapter) => ({
			id: this.chapterRowCounter++,
			title: chapter.title,
			start: chapter.start,
			end: chapter.end,
		}));

		if (this.chapterRows.length === 0) {
			this.chapterRows = [{
				id: this.chapterRowCounter++,
				title: 'Chapter 1',
				start: 0,
				end: 0,
			}];
		}
	}

	addChapterRow(): void {
		const lastEnd = this.chapterRows.length > 0 ? Number(this.chapterRows[this.chapterRows.length - 1].end) : 0;
		this.chapterRows = [
			...this.chapterRows,
			{
				id: this.chapterRowCounter++,
				title: `Chapter ${this.chapterRows.length + 1}`,
				start: Number.isFinite(lastEnd) ? lastEnd : 0,
				end: Number.isFinite(lastEnd) ? lastEnd : 0,
			},
		];
	}

	removeChapterRow(id: number): void {
		if (this.chapterRows.length <= 1) {
			return;
		}

		this.chapterRows = this.chapterRows.filter((chapter) => chapter.id !== id);
	}

	private validateChapterRows(): string | null {
		if (this.chapterRows.length === 0) {
			return 'At least one chapter is required';
		}

		for (let i = 0; i < this.chapterRows.length; i += 1) {
			const chapter = this.chapterRows[i];
			const title = chapter.title.trim();
			const start = Number(chapter.start);
			const end = Number(chapter.end);

			if (!title) {
				return `Chapter ${i + 1} requires a title`;
			}
			if (!Number.isFinite(start) || !Number.isFinite(end)) {
				return `Chapter ${i + 1} must have valid numeric start/end values`;
			}
			if (start < 0 || end < 0) {
				return `Chapter ${i + 1} start/end must be non-negative`;
			}
			if (end < start) {
				return `Chapter ${i + 1} end must be greater than or equal to start`;
			}

			if (i > 0) {
				const prevEnd = Number(this.chapterRows[i - 1].end);
				if (start < prevEnd) {
					return `Chapter ${i + 1} start must be >= previous chapter end`;
				}
			}
		}

		return null;
	}
}
