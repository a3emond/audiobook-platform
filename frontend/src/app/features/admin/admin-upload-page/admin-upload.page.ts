import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { AdminJob } from '../../../core/services/admin.service';
import { AdminUploadQueueService } from '../../../core/services/admin-upload-queue.service';
import { prepareCoverImageFile, prepareCoverImageFromUrl } from '../../../core/utils/image-upload';
import { ContentHelpComponent } from '../../../shared/ui/content-help/content-help.component';

@Component({
	selector: 'app-admin-upload-page',
	standalone: true,
	imports: [CommonModule, ContentHelpComponent],
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

	onFilesPicked(event: Event): void {
		const target = event.target as HTMLInputElement | null;
		const files = Array.from(target?.files ?? []);
		this.uploadQueue.addFiles(files);
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
