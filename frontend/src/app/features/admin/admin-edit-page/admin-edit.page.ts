import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import type { Book } from '../../../core/models/api.models';
import { AdminService } from '../../../core/services/admin.service';
import type { AiMetadataSuggestion } from '../../../core/services/admin.types';
import { AuthService } from '../../../core/services/auth.service';
import { coverUrlForBook } from '../../../core/utils/cover-url';
import { prepareCoverImageFile, prepareCoverImageFromUrl } from '../../../core/utils/image-upload';
import { ContentHelpComponent } from '../../../shared/ui/content-help/content-help.component';
import { FieldHelpComponent } from '../../../shared/ui/field-help/field-help.component';
import { AdminBookNavService } from '../admin-books-page/admin-book-nav.service';
import type { AiFieldRow, EditableChapter, MetadataFormValues } from './admin-edit-page.types';
import {
	applyAiRows,
	buildAiFieldRows,
	buildMetadataPayload,
	hydrateEditableChapters,
	nextChapterRow,
	validateChapterRows,
} from './admin-edit-page.utils';

const AI_ERROR_MESSAGES: Record<string, string> = {
	ai_not_configured: 'AI is not configured on the server (set ANTHROPIC_API_KEY).',
	ai_auth_failed: 'The server\'s Anthropic API key was rejected.',
	ai_rate_limited: 'AI is rate limited right now — try again in a minute.',
	ai_refused: 'The AI declined this request.',
	ai_no_result: 'The AI could not settle on an answer for this book.',
};

@Component({
	selector: 'app-admin-edit-page',
	standalone: true,
	imports: [CommonModule, FormsModule, FieldHelpComponent, ContentHelpComponent],
	templateUrl: './admin-edit.page.html',
	styleUrl: './admin-edit.page.css',
})
// AdminEditPage handles metadata/chapter editing and book maintenance actions
// while delegating payload building/validation to helper utilities.
export class AdminEditPage implements OnInit {
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly admin = inject(AdminService);
	private readonly auth = inject(AuthService);
	private readonly destroyRef = inject(DestroyRef);
	protected readonly nav = inject(AdminBookNavService);

	readonly loading = signal(false);
	readonly savingMetadata = signal(false);
	readonly savingChapters = signal(false);
	readonly error = signal<string | null>(null);
	readonly success = signal<string | null>(null);
	readonly chapterValidationError = signal<string | null>(null);
	readonly selectedCoverFile = signal<File | null>(null);
	readonly chaptersOpen = signal(false);
	readonly book = signal<Book | null>(null);

	readonly aiEnabled = signal(false);
	readonly aiLoading = signal(false);
	readonly aiError = signal<string | null>(null);
	readonly aiSuggestion = signal<AiMetadataSuggestion | null>(null);
	aiRows: AiFieldRow[] = [];

	readonly bookIdState = signal('');
	readonly position = computed(() => this.nav.neighbours(this.bookIdState()));
	readonly coverUrl = computed(() => {
		const book = this.book();
		return book ? coverUrlForBook(book, this.auth.accessToken()) : '';
	});

	private bookId = '';
	private currentBook: Book | null = null;
	private savedSnapshot = '';

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

	// Bootstrap loads the editable snapshot for a single book id.
	// The component is reused when stepping prev/next, so follow the param stream.
	ngOnInit(): void {
		this.admin.getAiStatus().subscribe({
			next: (status) => this.aiEnabled.set(status.enabled),
			error: () => this.aiEnabled.set(false),
		});

		this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
			const bookId = params.get('bookId');
			if (!bookId) {
				this.error.set('Missing book id');
				return;
			}
			this.bookId = bookId;
			this.bookIdState.set(bookId);
			this.success.set(null);
			this.resetAi();
			this.loadBook();
		});
	}

	@HostListener('window:keydown', ['$event'])
	onKeydown(event: KeyboardEvent): void {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
			event.preventDefault();
			this.saveMetadata();
		}
	}

	@HostListener('window:beforeunload', ['$event'])
	onBeforeUnload(event: BeforeUnloadEvent): void {
		if (this.isDirty()) {
			event.preventDefault();
		}
	}

	isDirty(): boolean {
		return !!this.savedSnapshot && this.snapshot() !== this.savedSnapshot;
	}

	goTo(bookId: string | null): void {
		if (!bookId || (this.isDirty() && !confirm('You have unsaved metadata changes. Discard them?'))) {
			return;
		}
		void this.router.navigate(['/admin/books', bookId]);
	}

	backToList(): void {
		if (this.isDirty() && !confirm('You have unsaved metadata changes. Discard them?')) {
			return;
		}
		void this.router.navigate(['/admin/books'], { queryParams: this.nav.listQuery() });
	}

	// --- AI-assisted metadata -------------------------------------------------

	fillWithAi(): void {
		if (!this.bookId || this.aiLoading()) {
			return;
		}

		this.aiLoading.set(true);
		this.aiError.set(null);
		this.aiSuggestion.set(null);

		this.admin.suggestBookMetadata(this.bookId).subscribe({
			next: (suggestion) => {
				this.aiLoading.set(false);
				this.aiSuggestion.set(suggestion);
				this.aiRows = buildAiFieldRows(this.formValues(), suggestion);
				if (this.aiRows.length === 0) {
					this.aiError.set('The AI agrees with the current metadata — nothing to change.');
				}
			},
			error: (error: unknown) => {
				this.aiLoading.set(false);
				const message = error instanceof Error ? error.message : 'AI lookup failed';
				this.aiError.set(AI_ERROR_MESSAGES[message] ?? message);
			},
		});
	}

	setAllAiRows(selected: boolean): void {
		this.aiRows = this.aiRows.map((row) => ({ ...row, selected }));
	}

	selectedAiRowCount(): number {
		return this.aiRows.filter((row) => row.selected).length;
	}

	// Applying only fills the form; the admin still reviews and saves.
	applyAiSuggestion(): void {
		const next = applyAiRows(this.formValues(), this.aiRows);
		this.title = next.title;
		this.author = next.author;
		this.series = next.series;
		this.seriesIndex = next.seriesIndex;
		this.genre = next.genre;
		this.language = next.language;
		this.tagsRaw = next.tagsRaw;
		this.descriptionDefault = next.descriptionDefault;
		const applied = this.selectedAiRowCount();
		this.resetAi();
		this.success.set(`Applied ${applied} AI suggestion(s) — review and save.`);
	}

	resetAi(): void {
		this.aiSuggestion.set(null);
		this.aiError.set(null);
		this.aiRows = [];
	}

	tagList(): string[] {
		return this.tagsRaw
			.split(',')
			.map((tag) => tag.trim())
			.filter(Boolean);
	}

	removeTag(tag: string): void {
		this.tagsRaw = this.tagList()
			.filter((value) => value !== tag)
			.join(', ');
	}

	// Metadata and chapters are saved independently so one section can be edited
	// without blocking the other.
	saveMetadata(then?: () => void): void {
		if (!this.bookId || this.savingMetadata()) {
			return;
		}

		this.savingMetadata.set(true);
		this.error.set(null);
		this.success.set(null);

		this.admin
			.updateBookMetadata(this.bookId, this.metadataPayloadKeepingLocales())
			.subscribe({
				next: (book) => {
					this.currentBook = book;
					this.book.set(book);
					this.savedSnapshot = this.snapshot();
					this.success.set('Metadata saved');
					this.savingMetadata.set(false);
					then?.();
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

		const validationError = validateChapterRows(this.chapterRows);
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

	// Destructive actions are queued as jobs and surfaced with backend job ids.
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

	saveAndNext(): void {
		const next = this.position().next;
		this.saveMetadata(() => {
			if (next) {
				void this.router.navigate(['/admin/books', next]);
			}
		});
	}

	private formValues(): MetadataFormValues {
		return {
			title: this.title,
			author: this.author,
			series: this.series,
			seriesIndex: this.seriesIndex,
			language: this.language,
			genre: this.genre,
			tagsRaw: this.tagsRaw,
			descriptionDefault: this.descriptionDefault,
		};
	}

	// The form edits the default description only; the API replaces the whole
	// description object, so carry the per-locale texts through unchanged.
	private metadataPayloadKeepingLocales() {
		const payload = buildMetadataPayload(this.formValues());
		payload.description = {
			...payload.description,
			en: this.currentBook?.description?.en ?? null,
			fr: this.currentBook?.description?.fr ?? null,
		};
		return payload;
	}

	private snapshot(): string {
		return JSON.stringify(buildMetadataPayload(this.formValues()));
	}

	private loadBook(): void {
		this.loading.set(true);
		this.error.set(null);

		this.admin.getBook(this.bookId).subscribe({
			next: (book) => {
				this.currentBook = book;
				this.book.set(book);
				this.hydrateForm(book);
				this.savedSnapshot = this.snapshot();
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
		this.chapterRows = hydrateEditableChapters(book.chapters, () => this.chapterRowCounter++);
	}

	addChapterRow(): void {
		this.chapterRows = [...this.chapterRows, nextChapterRow(this.chapterRows, () => this.chapterRowCounter++)];
	}

	removeChapterRow(id: number): void {
		if (this.chapterRows.length <= 1) {
			return;
		}

		this.chapterRows = this.chapterRows.filter((chapter) => chapter.id !== id);
	}

}
