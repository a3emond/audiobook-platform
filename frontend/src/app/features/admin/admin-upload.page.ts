import { CommonModule } from '@angular/common';
import { Component, OnDestroy, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AdminJob, AdminService } from '../../core/services/admin.service';
import { prepareCoverImageFile } from '../../core/utils/image-upload';

interface Mp3QueueMetadata {
	title: string;
	author: string;
	series: string;
	genre: string;
	coverFile: File | null;
}

interface UploadQueueItem {
	id: string;
	file: File;
	type: 'mp3' | 'audio';
	status: 'queued' | 'uploading' | 'done' | 'failed';
	jobId?: string;
	error?: string;
	mp3?: Mp3QueueMetadata;
}

@Component({
	selector: 'app-admin-upload-page',
	standalone: true,
	imports: [CommonModule],
	template: `
		<section class="admin-page page-shell">
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
						<th>MP3 Metadata</th>
						<th>Cover</th>
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
							<div *ngIf="item.type === 'mp3'" class="mp3-inline-grid">
								<input
									[disabled]="loading()"
									placeholder="Title"
									[value]="item.mp3?.title || ''"
									(input)="updateMp3Field(item.id, 'title', $any($event.target).value)"
								/>
								<input
									[disabled]="loading()"
									placeholder="Author (required)"
									[value]="item.mp3?.author || ''"
									(input)="updateMp3Field(item.id, 'author', $any($event.target).value)"
								/>
								<input
									[disabled]="loading()"
									placeholder="Series"
									[value]="item.mp3?.series || ''"
									(input)="updateMp3Field(item.id, 'series', $any($event.target).value)"
								/>
								<input
									[disabled]="loading()"
									placeholder="Genre"
									[value]="item.mp3?.genre || ''"
									(input)="updateMp3Field(item.id, 'genre', $any($event.target).value)"
								/>
							</div>
							<span *ngIf="item.type !== 'mp3'">-</span>
						</td>
						<td>
							<div *ngIf="item.type === 'mp3'" class="cover-cell">
								<input
									type="file"
									accept=".jpg,.jpeg,.png,.webp"
									[disabled]="loading()"
									(change)="onQueueCoverPicked(item.id, $event)"
								/>
								<span>{{ item.mp3?.coverFile?.name || 'No cover' }}</span>
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
		</section>
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
			.mp3-inline-grid { display: grid; gap: 0.35rem; min-width: 16rem; }
			.cover-cell { display: grid; gap: 0.35rem; }
			.jobs-panel { display: grid; gap: 0.5rem; }
			.jobs-panel h2 { margin: 0; font-size: 1rem; }
			.error { color: var(--color-danger); }
		`,
	],
})
export class AdminUploadPage implements OnDestroy {
	readonly queue = signal<UploadQueueItem[]>([]);
	readonly loading = signal(false);
	readonly lastQueuedJobId = signal<string | null>(null);
	readonly error = signal<string | null>(null);
	readonly trackedJobIds = signal<string[]>([]);
	readonly jobsById = signal<Record<string, AdminJob>>({});

	private pollTimer: ReturnType<typeof setInterval> | null = null;

	constructor(private readonly admin: AdminService) {}

	ngOnDestroy(): void {
		this.stopPolling();
	}

	onFilesPicked(event: Event): void {
		const target = event.target as HTMLInputElement | null;
		const files = Array.from(target?.files ?? []);
		if (files.length === 0) {
			return;
		}

		const queued = this.queue();
		const next = files.map((file, index) => this.createQueueItem(file, index));
		this.queue.set([...queued, ...next]);
		this.error.set(null);
	}

	async onQueueCoverPicked(itemId: string, event: Event): Promise<void> {
		const target = event.target as HTMLInputElement | null;
		const file = target?.files?.[0] ?? null;
		if (!file) {
			return;
		}

		try {
			const prepared = await prepareCoverImageFile(file);
			this.patchMp3QueueItem(itemId, {
				coverFile: prepared,
			});
		} catch (error: unknown) {
			this.error.set(error instanceof Error ? error.message : 'Invalid cover image');
		}
	}

	updateMp3Field(itemId: string, field: 'title' | 'author' | 'series' | 'genre', value: string): void {
		this.patchMp3QueueItem(itemId, {
			[field]: value,
		} as Partial<Mp3QueueMetadata>);
	}

	clearQueue(): void {
		this.queue.set([]);
		this.lastQueuedJobId.set(null);
		this.error.set(null);
		this.trackedJobIds.set([]);
		this.jobsById.set({});
		this.stopPolling();
	}

	startQueue(): void {
		if (this.loading()) {
			return;
		}

		const queue = this.queue();
		const nextIndex = queue.findIndex((item) => item.status === 'queued' || item.status === 'failed');
		if (nextIndex < 0) {
			return;
		}

		this.loading.set(true);
		this.error.set(null);
		this.lastQueuedJobId.set(null);
		this.uploadQueueItem(nextIndex);
	}

	private uploadQueueItem(index: number): void {
		const items = this.queue();
		if (index >= items.length) {
			this.loading.set(false);
			return;
		}

		const item = items[index];
		if (!item || item.status === 'done') {
			this.uploadQueueItem(index + 1);
			return;
		}

		this.updateQueueItem(index, { status: 'uploading', error: undefined });
		const isMp3 = item.type === 'mp3';

		if (isMp3 && !item.mp3?.author.trim()) {
			this.updateQueueItem(index, { status: 'failed', error: 'MP3 author is required' });
			this.error.set(`Author is required for ${item.file.name}`);
			this.uploadQueueItem(index + 1);
			return;
		}

		const request = isMp3
			? this.admin.uploadMp3AsM4b(
					item.file,
					{
						title: item.mp3?.title.trim() || undefined,
						author: item.mp3?.author.trim() || undefined,
						series: item.mp3?.series.trim() || undefined,
						genre: item.mp3?.genre.trim() || undefined,
					},
					item.mp3?.coverFile ?? null,
				)
			: this.admin.uploadBook(item.file);

		request.subscribe({
			next: (response) => {
				this.lastQueuedJobId.set(response.jobId);
				this.trackJob(response.jobId);
				this.updateQueueItem(index, {
					status: 'done',
					jobId: response.jobId,
					error: undefined,
				});
				this.uploadQueueItem(index + 1);
			},
			error: (error: unknown) => {
				const message = error instanceof Error ? error.message : 'Upload failed';
				this.updateQueueItem(index, {
					status: 'failed',
					error: message,
				});
				this.error.set(message);
				this.uploadQueueItem(index + 1);
			},
		});
	}

	private updateQueueItem(index: number, patch: Partial<UploadQueueItem>): void {
		const items = [...this.queue()];
		const current = items[index];
		if (!current) {
			return;
		}

		items[index] = {
			...current,
			...patch,
		};
		this.queue.set(items);
	}

	trackedJobs(): AdminJob[] {
		const jobs = this.jobsById();
		return this.trackedJobIds()
			.map((id) => jobs[id])
			.filter((job): job is AdminJob => Boolean(job));
	}

	private createQueueItem(file: File, index: number): UploadQueueItem {
		const type: UploadQueueItem['type'] = file.name.toLowerCase().endsWith('.mp3') ? 'mp3' : 'audio';
		const id = `${Date.now()}-${index}-${file.name}`;

		if (type === 'mp3') {
			const inferredTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
			return {
				id,
				file,
				type,
				status: 'queued',
				mp3: {
					title: inferredTitle,
					author: '',
					series: '',
					genre: 'Audiobook',
					coverFile: null,
				},
			};
		}

		return {
			id,
			file,
			type,
			status: 'queued',
		};
	}

	private patchMp3QueueItem(itemId: string, patch: Partial<Mp3QueueMetadata>): void {
		this.queue.update((items) =>
			items.map((item) => {
				if (item.id !== itemId || item.type !== 'mp3' || !item.mp3) {
					return item;
				}

				return {
					...item,
					mp3: {
						...item.mp3,
						...patch,
					},
				};
			}),
		);
	}

	private trackJob(jobId: string): void {
		if (!this.trackedJobIds().includes(jobId)) {
			this.trackedJobIds.update((ids) => [...ids, jobId]);
		}
		this.startPolling();
	}

	private startPolling(): void {
		if (this.pollTimer) {
			return;
		}

		this.pollTimer = setInterval(() => {
			void this.pollJobStatuses();
		}, 3000);

		void this.pollJobStatuses();
	}

	private stopPolling(): void {
		if (!this.pollTimer) {
			return;
		}
		clearInterval(this.pollTimer);
		this.pollTimer = null;
	}

	private async pollJobStatuses(): Promise<void> {
		const jobIds = this.trackedJobIds();
		if (jobIds.length === 0) {
			this.stopPolling();
			return;
		}

		const updates: Record<string, AdminJob> = {};
		for (const jobId of jobIds) {
			try {
				const job = await firstValueFrom(this.admin.getJob(jobId));
				updates[jobId] = job;
			} catch {
				// Ignore polling errors for individual jobs.
			}
		}

		if (Object.keys(updates).length > 0) {
			this.jobsById.update((current) => ({
				...current,
				...updates,
			}));
		}

		const allTerminal = jobIds.every((jobId) => {
			const status = (updates[jobId] ?? this.jobsById()[jobId])?.status;
			return status === 'done' || status === 'failed';
		});

		if (allTerminal) {
			this.stopPolling();
		}
	}
}
