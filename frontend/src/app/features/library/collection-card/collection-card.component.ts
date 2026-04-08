import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Collection } from '../../../core/models/api.models';
import { CompletedBooksService } from '../../../core/services/completed-books.service';

interface PreviewImage {
  bookId: string;
  url: string;
}

@Component({
  selector: 'app-collection-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './collection-card.component.html',
  styleUrl: './collection-card.component.css',
})
export class CollectionCardComponent {
  @Input({ required: true }) collection!: Collection;

  @Input() previewImages: PreviewImage[] = [];

  constructor(private readonly completedBooks: CompletedBooksService) {}

  fallbackLabel(): string {
    const label = this.collection?.name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');

    return label || 'CL';
  }

  isCompleted(bookId: string): boolean {
    return this.completedBooks.isCompleted(bookId);
  }
}
