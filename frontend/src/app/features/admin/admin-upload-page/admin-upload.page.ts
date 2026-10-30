import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';

import { AdminJob } from '../../../core/services/admin.service';
import { AdminUploadQueueService, type UploadQueueItem } from '../../../core/services/admin-upload-queue.service';
import { AUDIOBOOK_EXTENSIONS, collectDroppedFiles } from '../../../core/services/admin-upload-queue.utils';
import { prepareCoverImageFile, prepareCoverImageFromUrl } from '../../../core/utils/image-upload';

@Component({
	selector: 'app-admin-upload-page',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './admin-upload.page.html',
	styleUrl: './admin-upload.page.css',
})
// Main UI/state logic for this standalone view component.
export class AdminUploadPage {
	private readonly uploadQueue = inject(AdminUploadQueueService);

	readonly queue = this.uploadQueue.queue;
	readonly loading = this.uploadQueue.loading;
	readonly lastQueuedJobId = this.uploadQueue.lastQueuedJobId;
	readonly error = this.uploadQueue.error;
	readonly trackedJobIds = this.uploadQueue.trackedJobIds;

	readonly accept = AUDIOBOOK_EXTENSIONS.join(',');
	readonly dragActive = signal(false);
	readonly scanning = signal(false);
	readonly notice = signal<string | null>(null);
	readonly defaultLanguage = signal<'fr' | 'en'>('en');
	private dragDepth = 0;

	readonly counts = computed(() => {
		const items = this.queue();
		return {
			total: items.length,
			pending: items.filter((item) => item.status === 'queued' || item.status === 'failed').length,
			done: items.filter((item) => item.status === 'done').length,
			failed: items.filter((item) => item.status === 'failed').length,
			bytes: items.reduce((sum, item) => sum + item.file.size, 0),
			splitFolders: new Set(items.filter((item) => item.folderAudioCount > 1).map((item) => item.folder)).size,
		};
	});

	// Rows grouped by source folder so a dropped library stays readable.
	readonly groups = computed(() => {
		const byFolder = new Map<string, UploadQueueItem[]>();
		for (const item of this.queue()) {
			byFolder.set(item.folder, [...(byFolder.get(item.folder) ?? []), item]);
		}
		return Array.from(byFolder, ([folder, items]) => ({ folder, items }));
	});

	onFilesPicked(event: Event): void {
		const target = event.target as HTMLInputElement | null;
		const files = Array.from(target?.files ?? []);
		this.addPicked(files.map((file) => ({ file, relativePath: file.webkitRelativePath || file.name })));
		if (target) target.value = '';
	}

	onDragEnter(event: DragEvent): void {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		this.dragDepth += 1;
		this.dragActive.set(true);
	}

	onDragOver(event: DragEvent): void {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
	}

	onDragLeave(): void {
		this.dragDepth = Math.max(0, this.dragDepth - 1);
		if (this.dragDepth === 0) this.dragActive.set(false);
	}

	async onDrop(event: DragEvent): Promise<void> {
		event.preventDefault();
		this.dragDepth = 0;
		this.dragActive.set(false);
		if (!event.dataTransfer) return;

		this.scanning.set(true);
		try {
			this.addPicked(await collectDroppedFiles(event.dataTransfer));
		} catch (error: unknown) {
			this.uploadQueue.setError(error instanceof Error ? error.message : 'Could not read the dropped folder');
		} finally {
			this.scanning.set(false);
		}
	}

	removeItem(item: UploadQueueItem): void {
		this.uploadQueue.removeItems([item.id]);
	}

	removeFolder(items: UploadQueueItem[]): void {
		this.uploadQueue.removeItems(items.filter((item) => item.status !== 'done').map((item) => item.id));
	}

	setAllLanguages(language: 'fr' | 'en'): void {
		this.defaultLanguage.set(language);
		this.uploadQueue.setAllLanguages(language);
	}

	formatSize(bytes: number): string {
		if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
		return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
	}

	private addPicked(picked: Array<{ file: File; relativePath: string }>): void {
		const result = this.uploadQueue.addPicked(picked, this.defaultLanguage());
		const parts = [`Added ${result.added} audiobook file${result.added === 1 ? '' : 's'}`];
		if (result.skipped > 0) parts.push(`ignored ${result.skipped} other file${result.skipped === 1 ? '' : 's'}`);
		if (result.duplicates > 0) parts.push(`${result.duplicates} already queued`);
		this.notice.set(parts.join(' · '));
	}

	async onQueueCoverPicked(itemId: string, event: Event): Promise<void> {
		const target = event.target as HTMLInputElement | null;
		const file = target?.files?.[0] ?? null;
		if (!file) {
			return;
		}

		try {
			const prepared = await prepareCoverImageFile(file);
			this.uploadQueue.updateMp3Cover(itemId, prepared);
		} catch (error: unknown) {
			this.uploadQueue.setError(error instanceof Error ? error.message : 'Invalid cover image');
		}
	}

	async onQueueCoverUrlPicked(itemId: string, imageUrl: string): Promise<void> {
		const value = imageUrl.trim();
		if (!value) {
			this.uploadQueue.setError('Please provide an image URL');
			return;
		}

		try {
			const prepared = await prepareCoverImageFromUrl(value);
			this.uploadQueue.updateMp3Cover(itemId, prepared);
			this.uploadQueue.setError(null);
		} catch (error: unknown) {
			this.uploadQueue.setError(error instanceof Error ? error.message : 'Invalid cover image URL');
		}
	}

	updateItemLanguage(itemId: string, language: 'fr' | 'en'): void {
		this.uploadQueue.updateItemLanguage(itemId, language);
	}

	clearQueue(): void {
		this.uploadQueue.clearQueue();
	}

	startQueue(): void {
		this.uploadQueue.startQueue();
	}

	trackedJobs(): AdminJob[] {
		return this.uploadQueue.trackedJobs();
	}
}
