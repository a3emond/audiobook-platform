import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminService } from '../../../core/services/admin.service';
import { FieldHelpComponent } from '../../../shared/ui/field-help/field-help.component';
import type {
  AdminEditorialBlock,
  AdminEditorialBlockItem,
  AdminEditorialBookOption,
  AdminEditorialSeriesOption,
} from '../../../core/services/admin.types';

interface EditableItem {
  id?: string;
  itemType: 'series' | 'book';
  target: string;
  position: number;
  badge: string;
  kicker: string;
  customTitle: string;
  customImage: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

@Component({
  selector: 'app-admin-editorial-page',
  standalone: true,
  imports: [CommonModule, FormsModule, FieldHelpComponent],
  templateUrl: './admin-editorial.page.html',
  styleUrl: './admin-editorial.page.css',
})
export class AdminEditorialPage implements OnInit {
  readonly blocks = signal<AdminEditorialBlock[]>([]);
  readonly seriesOptions = signal<AdminEditorialSeriesOption[]>([]);
  readonly bookOptions = signal<AdminEditorialBookOption[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly selectedBlockId = signal<string | null>(null);
  readonly itemsDraft = signal<EditableItem[]>([]);

  createSlug = '';
  createTitle = '';

  editSlug = '';
  editTitle = '';
  editSubtitle = '';
  editTheme = '';
  editSortOrder = 0;
  editMaxItems = 8;
  editStartsAt = '';
  editEndsAt = '';
  editIsActive = true;

  readonly selectedBlock = computed(() => {
    const selectedId = this.selectedBlockId();
    if (!selectedId) {
      return null;
    }
    return this.blocks().find((block) => block.id === selectedId) ?? null;
  });

  constructor(private readonly admin: AdminService) {}

  ngOnInit(): void {
    this.loadCatalogOptions();
    this.loadBlocks();
  }

  loadCatalogOptions(): void {
    this.admin.getEditorialCatalogOptions().subscribe({
      next: (options) => {
        this.seriesOptions.set(options.series);
        this.bookOptions.set(options.books);
      },
      error: () => {
        // Non-blocking: manual editing still works if options fail to load.
      },
    });
  }

  loadBlocks(): void {
    this.loading.set(true);
    this.error.set(null);

    this.admin.listEditorialBlocks().subscribe({
      next: (response) => {
        const sorted = [...response.blocks].sort((left, right) => left.sortOrder - right.sortOrder);
        this.blocks.set(sorted);
        this.loading.set(false);

        const current = this.selectedBlockId();
        const nextSelection = current && sorted.some((block) => block.id === current)
          ? current
          : sorted[0]?.id ?? null;
        this.selectBlock(nextSelection);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Unable to load editorial blocks');
        this.loading.set(false);
      },
    });
  }

  createBlock(): void {
    const slug = this.createSlug.trim();
    const title = this.createTitle.trim();

    if (!slug || !title) {
      this.error.set('Slug and title are required to create a block.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.info.set(null);

    this.admin.createEditorialBlock({
      slug,
      title,
      scope: 'library',
      displayType: 'fan_cards',
      maxItems: 8,
      sortOrder: this.blocks().length,
      isActive: true,
    }).subscribe({
      next: (created) => {
        this.blocks.update((current) => [...current, created].sort((left, right) => left.sortOrder - right.sortOrder));
        this.createSlug = '';
        this.createTitle = '';
        this.selectBlock(created.id);
        this.info.set('Editorial block created.');
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Unable to create block');
        this.saving.set(false);
      },
    });
  }

  selectBlock(blockId: string | null): void {
    this.selectedBlockId.set(blockId);
    this.info.set(null);

    const block = this.blocks().find((entry) => entry.id === blockId) ?? null;
    if (!block) {
      this.itemsDraft.set([]);
      this.editSlug = '';
      this.editTitle = '';
      this.editSubtitle = '';
      this.editTheme = '';
      this.editSortOrder = 0;
      this.editMaxItems = 8;
      this.editStartsAt = '';
      this.editEndsAt = '';
      this.editIsActive = true;
      return;
    }

    this.editSlug = block.slug;
    this.editTitle = block.title;
    this.editSubtitle = block.subtitle ?? '';
    this.editTheme = block.theme ?? '';
    this.editSortOrder = block.sortOrder;
    this.editMaxItems = block.maxItems;
    this.editStartsAt = this.toDateInput(block.startsAt ?? null);
    this.editEndsAt = this.toDateInput(block.endsAt ?? null);
    this.editIsActive = block.isActive;

    this.itemsDraft.set(
      [...block.items]
        .sort((left, right) => left.position - right.position)
        .map((item) => this.toEditableItem(item)),
    );
  }

  saveBlockMeta(): void {
    const block = this.selectedBlock();
    if (!block) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.info.set(null);

    this.admin.updateEditorialBlock(block.id, {
      slug: this.editSlug.trim(),
      title: this.editTitle.trim(),
      subtitle: this.editSubtitle.trim() || null,
      theme: this.editTheme.trim() || null,
      isActive: this.editIsActive,
      sortOrder: this.editSortOrder,
      maxItems: this.editMaxItems,
      startsAt: this.editStartsAt || null,
      endsAt: this.editEndsAt || null,
    }).subscribe({
      next: (updated) => {
        this.blocks.update((current) =>
          current.map((entry) => (entry.id === updated.id ? updated : entry)).sort((left, right) => left.sortOrder - right.sortOrder),
        );
        this.selectBlock(updated.id);
        this.info.set('Block metadata saved.');
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Unable to update block');
        this.saving.set(false);
      },
    });
  }

  addItem(itemType: 'series' | 'book'): void {
    const nextPosition = this.itemsDraft().length;
    const defaultTarget = itemType === 'series'
      ? (this.seriesOptions()[0]?.name ?? '')
      : (this.bookOptions()[0]?.id ?? '');

    this.itemsDraft.update((items) => [
      ...items,
      {
        itemType,
        target: defaultTarget,
        position: nextPosition,
        badge: '',
        kicker: '',
        customTitle: '',
        customImage: '',
        startsAt: '',
        endsAt: '',
        isActive: true,
      },
    ]);
  }

  removeItem(index: number): void {
    this.itemsDraft.update((items) => items.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({
      ...item,
      position: itemIndex,
    })));
  }

  moveItem(index: number, direction: -1 | 1): void {
    this.itemsDraft.update((items) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= items.length) {
        return items;
      }

      const next = [...items];
      const current = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = current;

      return next.map((item, itemIndex) => ({
        ...item,
        position: itemIndex,
      }));
    });
  }

  itemTargetLabel(item: EditableItem): string {
    if (item.itemType === 'series') {
      const series = this.seriesOptions().find((entry) => entry.name === item.target);
      return series ? `${series.name} (${series.bookCount})` : item.target;
    }

    const book = this.bookOptions().find((entry) => entry.id === item.target);
    if (!book) {
      return item.target;
    }

    const seriesSuffix = book.series ? ` • ${book.series}` : '';
    return `${book.title} - ${book.author}${seriesSuffix}`;
  }

  saveItems(): void {
    const block = this.selectedBlock();
    if (!block) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.info.set(null);

    this.admin.replaceEditorialBlockItems(block.id, {
      items: this.itemsDraft().map((item, index) => ({
        id: item.id,
        itemType: item.itemType,
        target: item.target.trim(),
        position: index,
        badge: item.badge.trim() || null,
        kicker: item.kicker.trim() || null,
        customTitle: item.customTitle.trim() || null,
        customImage: item.customImage.trim() || null,
        startsAt: item.startsAt || null,
        endsAt: item.endsAt || null,
        isActive: item.isActive,
      })),
    }).subscribe({
      next: (updated) => {
        this.blocks.update((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
        this.selectBlock(updated.id);
        this.info.set('Items saved.');
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Unable to save items');
        this.saving.set(false);
      },
    });
  }

  deleteSelectedBlock(): void {
    const block = this.selectedBlock();
    if (!block) {
      return;
    }

    const confirmed = confirm(`Delete block \"${block.title}\"?`);
    if (!confirmed) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.info.set(null);

    this.admin.deleteEditorialBlock(block.id).subscribe({
      next: () => {
        this.blocks.update((current) => current.filter((entry) => entry.id !== block.id));
        this.selectBlock(this.blocks()[0]?.id ?? null);
        this.info.set('Block deleted.');
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Unable to delete block');
        this.saving.set(false);
      },
    });
  }

  private toEditableItem(item: AdminEditorialBlockItem): EditableItem {
    return {
      id: item.id,
      itemType: item.itemType,
      target: item.target,
      position: item.position,
      badge: item.badge ?? '',
      kicker: item.kicker ?? '',
      customTitle: item.customTitle ?? '',
      customImage: item.customImage ?? '',
      startsAt: this.toDateInput(item.startsAt ?? null),
      endsAt: this.toDateInput(item.endsAt ?? null),
      isActive: item.isActive,
    };
  }

  private toDateInput(value: string | null): string {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toISOString().slice(0, 16);
  }
}
