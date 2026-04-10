import { Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AdminJob, AdminService } from './admin.service';

export interface Mp3QueueMetadata {
	coverFile: File | null;
}

export interface UploadQueueItem {
	id: string;
	file: File;
	type: 'mp3' | 'audio';
	status: 'queued' | 'uploading' | 'done' | 'failed';
	jobId?: string;
	error?: string;
	language: 'fr' | 'en';
	mp3?: Mp3QueueMetadata;
}

@Injectable({ providedIn: 'root' })
// admin-upload-queue: keeps UI and state logic readable for this frontend unit.
export class AdminUploadQueueService {
	readonly queue = signal<UploadQueueItem[]>([]);
	readonly loading = signal(false);
	readonly lastQueuedJobId = signal<string | null>(null);
	readonly error = signal<string | null>(null);
	readonly trackedJobIds = signal<string[]>([]);
	readonly jobsById = signal<Record<string, AdminJob>>({});

	private jobsStreamHandle?: { stop: () => void };

	constructor(private readonly admin: AdminService) {}

	addFiles(files: File[]): void {
		if (files.length === 0) {
			return;
		}

		const queued = this.queue();
		const next = files.map((file, index) => this.createQueueItem(file, index));
		this.queue.set([...queued, ...next]);
		this.error.set(null);
	}

	setError(message: string | null): void {
		this.error.set(message);
	}

	updateItemLanguage(itemId: string, language: 'fr' | 'en'): void {
		this.queue.update((items) =>
			items.map((item) => {
				if (item.id !== itemId) {
					return item;
				}

				return {
					...item,
					language,
				};
			}),
		);
	}

	updateMp3Cover(itemId: string, coverFile: File | null): void {
		this.queue.update((items) =>
			items.map((item) => {
				if (item.id !== itemId || item.type !== 'mp3' || !item.mp3) {
					return item;
				}

				return {
					...item,
					mp3: {
						...item.mp3,
						coverFile,
					},
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

	trackedJobs(): AdminJob[] {
		const jobs = this.jobsById();
		return this.trackedJobIds()
			.map((id) => jobs[id])
			.filter((job): job is AdminJob => Boolean(job));
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

				const allTerminal = this.trackedJobIds().every((trackedJobId) => {
					const status = this.jobsById()[trackedJobId]?.status;
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
