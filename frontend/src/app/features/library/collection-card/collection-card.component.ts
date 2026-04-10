import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Collection } from '../../../core/models/api.models';
import { I18nService } from '../../../core/services/i18n.service';
import { LibraryProgressService } from '../../../core/services/library-progress.service';
import { CoverTileComponent } from '../../../shared/ui/cover-tile/cover-tile.component';

interface PreviewImage {
  bookId: string;
  url: string;
}

@Component({
  selector: 'app-collection-card',
  standalone: true,
  imports: [CommonModule, RouterLink, CoverTileComponent],
  templateUrl: './collection-card.component.html',
  styleUrl: './collection-card.component.css',
})
// collection-card: keeps UI and state logic readable for this frontend unit.
export class CollectionCardComponent {
  @Input({ required: true }) collection!: Collection;

  @Input() previewImages: PreviewImage[] = [];

  constructor(
    private readonly libraryProgress: LibraryProgressService,
    protected readonly i18n: I18nService,
  ) {}

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
    return this.libraryProgress.isCompleted(bookId);
  }

  progressPercent(bookId: string): number | null {
    return this.libraryProgress.progressPercentByBookId(bookId);
  }
}
