import { CommonModule } from '@angular/common';
import { Component, OnDestroy, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AdminJob, AdminService } from '../../core/services/admin.service';
import { prepareCoverImageFile } from '../../core/utils/image-upload';

interface Mp3QueueMetadata {
	coverFile: File | null;
}

interface UploadQueueItem {
	id: string;
	file: File;
	type: 'mp3' | 'audio';
	status: 'queued' | 'uploading' | 'done' | 'failed';
	jobId?: string;
	error?: string;
	language: 'fr' | 'en';
	mp3?: Mp3QueueMetadata;
}

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
export class AdminUploadPage implements OnDestroy {
	readonly queue = signal<UploadQueueItem[]>([]);
	readonly loading = signal(false);
	readonly lastQueuedJobId = signal<string | null>(null);
	readonly error = signal<string | null>(null);
	readonly trackedJobIds = signal<string[]>([]);
	readonly jobsById = signal<Record<string, AdminJob>>({});

	private jobsStreamHandle?: { stop: () => void };

	constructor(private readonly admin: AdminService) {}

	ngOnDestroy(): void {
		this.jobsStreamHandle?.stop();
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

	updateItemLanguage(itemId: string, language: 'fr' | 'en'): void {
		this.queue.update((items) =>
			items.map((item) => {
				if (item.id !== itemId) {
					return item;
				}

				if (item.type === 'mp3' && item.mp3) {
					return {
						...item,
						language,
						mp3: {
							...item.mp3,
							language,
						},
					};
				}

				return {
					...item,
					language,
				};
			}),
		);
	}

	clearQueue(): void {
		this.queue.set([]);
		this.lastQueuedJobId.set(null);
		this.error.set(null);
		this.trackedJobIds.set([]);
		this.jobsById.set({});
		this.jobsStreamHandle?.stop();
		this.jobsStreamHandle = undefined;
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

		const request = isMp3
			? this.admin.uploadMp3AsM4b(item.file, item.language, item.mp3?.coverFile ?? null)
			: this.admin.uploadBook(item.file, item.language);

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
			return {
				id,
				file,
				type,
				status: 'queued',
				mp3: { coverFile: null },
				language: 'en',
			};
		}

		return {
			id,
			file,
			type,
			status: 'queued',
			language: 'en',
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
		this.startRealtimeTracking();
	}

	private startRealtimeTracking(): void {
		if (this.jobsStreamHandle) {
			return;
		}

		this.jobsStreamHandle = this.admin.startJobsStream({
			onJobs: (jobs) => {
				const tracked = new Set(this.trackedJobIds());
				this.jobsById.update((current) => {
					const next = { ...current };
					for (const job of jobs) {
						if (tracked.has(job.id)) {
							next[job.id] = job;
						}
					}
					return next;
				});

				const allTerminal = this.trackedJobIds().every((jobId) => {
					const status = this.jobsById()[jobId]?.status;
					return status === 'done' || status === 'failed';
				});

				if (allTerminal) {
					this.jobsStreamHandle?.stop();
					this.jobsStreamHandle = undefined;
				}
			},
		});

		for (const jobId of this.trackedJobIds()) {
			void firstValueFrom(this.admin.getJob(jobId))
				.then((job) => {
					this.jobsById.update((current) => ({ ...current, [job.id]: job }));
				})
				.catch(() => undefined);
		}
	}
}
