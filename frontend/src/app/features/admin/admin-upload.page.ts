import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

import { AdminUploadQueueService } from '../../core/services/admin-upload-queue.service';
import { prepareCoverImageFile } from '../../core/utils/image-upload';

@Component({
	selector: 'app-admin-upload-page',
	standalone: true,
	imports: [CommonModule],
	template: `
		<div class="admin-page">
			<h1>Admin Upload</h1>
			<input type="file" multiple accept=".m4b,.m4a,.mp3,.ogg,.wav" (change)="onFilesPicked($event)" />

			<div class="actions">
				<button type="button" class="btn-action" [disabled]="queue().length === 0 || loading()" (click)="startQueue()">
					{{ loading() ? 'Uploading Queue...' : 'Start Batch Upload' }}
				</button>
				<button type="button" class="btn-action" [disabled]="loading() || queue().length === 0" (click)="clearQueue()">
					Clear Queue
				</button>
			</div>

			<table *ngIf="queue().length > 0" class="queue-table">
				<thead>
					<tr>
						<th>File</th>
						<th>Type</th>
						<th>Lang</th>
						<th>Cover override</th>
						<th>Status</th>
						<th>Job</th>
						<th>Error</th>
					</tr>
				</thead>
				<tbody>
					<tr *ngFor="let item of queue()">
						<td>{{ item.file.name }}</td>
						<td>{{ item.type }}</td>
						<td>
							<div class="lang-radio">
								<label>
									<input
										type="radio"
										[name]="'lang-' + item.id"
										[value]="'en'"
										[checked]="item.language === 'en'"
										[disabled]="loading()"
										(change)="updateItemLanguage(item.id, 'en')"
									/>
									EN
								</label>
								<label>
									<input
										type="radio"
										[name]="'lang-' + item.id"
										[value]="'fr'"
										[checked]="item.language === 'fr'"
										[disabled]="loading()"
										(change)="updateItemLanguage(item.id, 'fr')"
									/>
									FR
								</label>
							</div>
						</td>
						<td>
							<div *ngIf="item.type === 'mp3'" class="cover-cell">
								<input
									type="file"
									accept=".jpg,.jpeg,.png,.webp"
									[disabled]="loading()"
									(change)="onQueueCoverPicked(item.id, $event)"
								/>
								<span>{{ item.mp3?.coverFile?.name || 'Auto-extracted' }}</span>
							</div>
							<span *ngIf="item.type !== 'mp3'">-</span>
						</td>
						<td>{{ item.status }}</td>
						<td>{{ item.jobId || '-' }}</td>
						<td>{{ item.error || '-' }}</td>
					</tr>
				</tbody>
			</table>

			<section *ngIf="trackedJobIds().length > 0" class="jobs-panel">
				<h2>Batch Job Progress</h2>
				<table class="queue-table">
					<thead>
						<tr>
							<th>Job ID</th>
							<th>Type</th>
							<th>Status</th>
							<th>Updated</th>
						</tr>
					</thead>
					<tbody>
						<tr *ngFor="let job of trackedJobs()">
							<td>{{ job.id }}</td>
							<td>{{ job.type }}</td>
							<td>{{ job.status }}</td>
							<td>{{ job.updatedAt || '-' }}</td>
						</tr>
					</tbody>
				</table>
			</section>

			<p *ngIf="lastQueuedJobId()">Last queued job: {{ lastQueuedJobId() }}</p>
			<p *ngIf="error()" class="error">{{ error() }}</p>
		</div>
	`,
	styles: [
		`
			.admin-page { display: grid; gap: 0.8rem; max-width: 56rem; }
			.actions { display: flex; gap: 0.6rem; }
			.btn-action {
				border: 1px solid #3a3a3a;
				background: #1a1a1a;
				color: var(--color-text);
				border-radius: 0.45rem;
				padding: 0.4rem 0.65rem;
			}
			.btn-action:hover { background: #252525; }
			.queue-table { width: 100%; border-collapse: collapse; background: var(--color-surface); }
			.queue-table th, .queue-table td { border: 1px solid var(--color-border); padding: 0.4rem; text-align: left; }
			.queue-table th { background: #1a1a1a; color: var(--color-text-muted); }
			.lang-radio { display: flex; gap: 0.5rem; font-size: 0.82rem; }
			.cover-cell { display: grid; gap: 0.35rem; }
			.jobs-panel { display: grid; gap: 0.5rem; }
			.jobs-panel h2 { margin: 0; font-size: 1rem; }
			.error { color: var(--color-danger); }
		`,
	],
})
export class AdminUploadPage {
	readonly queue = this.uploadQueue.queue;
	readonly loading = this.uploadQueue.loading;
	readonly lastQueuedJobId = this.uploadQueue.lastQueuedJobId;
	readonly error = this.uploadQueue.error;
	readonly trackedJobIds = this.uploadQueue.trackedJobIds;

	constructor(private readonly uploadQueue: AdminUploadQueueService) {}

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
