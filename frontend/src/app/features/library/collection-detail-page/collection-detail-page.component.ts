import { CommonModule } from '@angular/common';
import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import type { Book, Collection } from '../../../core/models/api.models';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { I18nService } from '../../../core/services/i18n.service';
import { LibraryService } from '../../../core/services/library.service';
import { ProgressService } from '../../../core/services/progress.service';
import { BookCardComponent } from '../book-card/book-card.component';
import {
  AUTO_ACTIVITY_COLLECTION_ID,
  computeListenedBookOrder,
  deriveActivityCollection,
  filterEditorBooks,
  orderedBooksFromIds,
  syncVisibleBooks,
} from './collection-detail-page.utils';

@Component({
  selector: 'app-collection-detail-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BookCardComponent, TranslatePipe],
  templateUrl: './collection-detail-page.component.html',
  styleUrl: './collection-detail-page.component.css',
})
// collection-detail-page: keeps UI and state logic readable for this frontend unit.
export class CollectionDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly library = inject(LibraryService);
  private readonly progress = inject(ProgressService);
  protected readonly i18n = inject(I18nService);

  readonly collection = signal<Collection | null>(null);
  readonly books = signal<Book[]>([]);
  readonly allBooks = signal<Book[]>([]);
  readonly editorBooks = signal<Book[]>([]);
  readonly selectedBookIds = signal<string[]>([]);
  readonly editingBooks = signal(false);
  readonly isAutoCollection = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  editorFilter = '';

  private collectionId = '';
  private editorFilterTimeout?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      this.i18n.locale();
      if (!this.collectionId) {
        return;
      }

      if (this.isAutoCollection()) {
        this.refreshAutoCollection();
        return;
      }

      this.refreshCollectionAndBooks(true);
    });
  }

  ngOnInit(): void {
    const collectionId = this.route.snapshot.paramMap.get('collectionId');
    if (!collectionId) {
      this.error.set(this.i18n.t('collections.error.missingId'));
      return;
    }

    this.collectionId = collectionId;

    if (this.collectionId === AUTO_ACTIVITY_COLLECTION_ID) {
      this.isAutoCollection.set(true);
      this.refreshAutoCollection();
      return;
    }

    this.isAutoCollection.set(false);
    this.refreshCollectionAndBooks(true);
  }

  renameCollection(): void {
    const collection = this.collection();
    if (!collection) {
      return;
    }

    const nextName = prompt(this.i18n.t('collections.renamePrompt'), collection.name)?.trim();
    if (!nextName || nextName === collection.name) {
      return;
    }

    this.library.updateCollection(collection.id, { name: nextName }).subscribe({
      next: (updated) => {
        this.collection.set(updated);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : this.i18n.t('collections.renameError'));
      },
    });
  }

  deleteCollection(): void {
    const collection = this.collection();
    if (!collection) {
      return;
    }

    const confirmed = confirm(this.i18n.t('collections.deleteConfirm', { name: collection.name }));
    if (!confirmed) {
      return;
    }

    this.library.deleteCollection(collection.id).subscribe({
      next: () => {
        void this.router.navigateByUrl('/library');
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : this.i18n.t('collections.deleteError'));
      },
    });
  }

  openBooksEditor(): void {
    const collection = this.collection();
    if (!collection) {
      return;
    }

    this.editingBooks.set(true);
    this.selectedBookIds.set([...collection.bookIds]);
    this.editorFilter = '';
    this.editorBooks.set(this.allBooks());
  }

  closeBooksEditor(): void {
    this.editingBooks.set(false);
    this.editorFilter = '';
    this.editorBooks.set(this.allBooks());
  }

  onEditorFilterChange(): void {
    if (this.editorFilterTimeout) {
      clearTimeout(this.editorFilterTimeout);
    }

    this.editorFilterTimeout = setTimeout(() => {
      this.editorBooks.set(filterEditorBooks(this.allBooks(), this.editorFilter));
    }, 180);
  }

  toggleCollectionBook(bookId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked === true;
    const current = new Set(this.selectedBookIds());
    if (checked) {
      current.add(bookId);
    } else {
      current.delete(bookId);
    }
    this.selectedBookIds.set(Array.from(current));
  }

  isCollectionBookSelected(bookId: string): boolean {
    return this.selectedBookIds().includes(bookId);
  }

  saveBooksEditor(): void {
    const collection = this.collection();
    if (!collection) {
      return;
    }

    this.library.updateCollection(collection.id, { bookIds: this.selectedBookIds() }).subscribe({
      next: (updated) => {
        this.collection.set(updated);
        this.books.set(syncVisibleBooks(this.allBooks(), updated.bookIds));
        this.closeBooksEditor();
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : this.i18n.t('collections.updateBooksError'));
      },
    });
  }

  refreshCollection(): void {
    if (this.isAutoCollection()) {
      this.refreshAutoCollection();
      return;
    }

    this.refreshCollectionAndBooks(false);
  }

  private refreshAutoCollection(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      booksResponse: this.library.listBooks({ limit: 300, offset: 0 }),
      progress: this.progress.listMineAll(100),
    }).subscribe({
      next: ({ booksResponse, progress }) => {
        const orderedIds = computeListenedBookOrder(progress);
        const orderedBooks = orderedBooksFromIds(orderedIds, booksResponse.books);

        this.collection.set(deriveActivityCollection(this.i18n.t('library.activityCollection'), orderedBooks));
        this.allBooks.set(booksResponse.books);
        this.books.set(orderedBooks);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : this.i18n.t('collections.error.activity'));
        this.loading.set(false);
      },
    });
  }

  private refreshCollectionAndBooks(loadAllBooks: boolean): void {
    this.loading.set(true);
    this.error.set(null);

    this.library.getCollection(this.collectionId).subscribe({
      next: (collection) => {
        this.collection.set(collection);

        if (loadAllBooks || this.allBooks().length === 0) {
          this.library.listBooks({ limit: 300, offset: 0 }).subscribe({
            next: (response) => {
              this.allBooks.set(response.books);
              this.editorBooks.set(response.books);
              this.books.set(syncVisibleBooks(response.books, collection.bookIds));
              this.loading.set(false);
            },
            error: (error: unknown) => {
                this.error.set(error instanceof Error ? error.message : this.i18n.t('collections.error.books'));
              this.loading.set(false);
            },
          });
          return;
        }

        this.books.set(syncVisibleBooks(this.allBooks(), collection.bookIds));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : this.i18n.t('collections.error.load'));
        this.loading.set(false);
      },
    });
  }

}
