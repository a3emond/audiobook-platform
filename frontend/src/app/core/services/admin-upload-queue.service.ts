/**
 * ============================================================
 * admin-upload-queue.service.ts
 * ============================================================
 *
 * Coordinates local upload-queue state with backend job creation
 * and real-time job-status tracking. File objects stay in memory;
 * only lightweight metadata (jobIds, lastQueuedJobId) is persisted
 * to localStorage so the UI survives a page refresh.
 *
 * Exported:
 *   AdminUploadQueueService — root-level injectable
 *   UploadQueueItem         — one item in the upload queue
 *   Mp3QueueMetadata        — optional cover-file metadata for MP3 uploads
 *
 * Signals:
 *   queue            — UploadQueueItem[]: current upload queue
 *   loading          — true while an upload is in flight
 *   lastQueuedJobId  — id of the most recently created backend job
 *   error            — last error message or null
 *   trackedJobIds    — ids of jobs whose status is being watched
 *   jobsById         — Record<id, AdminJob>: latest known state per tracked job
 *
 * Methods:
 *   addFiles(files)                   — push files onto the queue
 *   setError(message)                 — set or clear the error signal
 *   updateItemLanguage(id, lang)      — patch language on a queued item
 *   updateMp3Cover(id, coverFile)     — attach a cover image to an MP3 item
 *   clearQueue()                      — reset all queue state
 *   startQueue()                      — begin uploading the next pending item
 *   trackedJobs()                     — AdminJob[]: jobs currently being tracked
 * ============================================================
 */
import { Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AdminService } from './admin.service';
import type { AdminJob } from './admin.types';
import {
	allTrackedJobsTerminal,
	createQueueItem,
	mergeTrackedJobs,
	patchQueueItem,
	patchQueueItemById,
} from './admin-upload-queue.utils';

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
// AdminUploadQueueService coordinates local upload queue state with backend job
// creation and job-status tracking.
export class AdminUploadQueueService {
	// Queue state is persistent enough to survive refreshes, but file contents remain in memory only.
	readonly queue = signal<UploadQueueItem[]>([]);
	readonly loading = signal(false);
	readonly lastQueuedJobId = signal<string | null>(null);
	readonly error = signal<string | null>(null);
	readonly trackedJobIds = signal<string[]>([]);
	readonly jobsById = signal<Record<string, AdminJob>>({});

	private jobsStreamHandle?: { stop: () => void };
	private readonly storageKey = 'audiobook:upload-queue:metadata';

	constructor(private readonly admin: AdminService) {
		this.loadQueueMetadata();
	}

	// Only lightweight metadata is restored; File objects themselves cannot be serialized.
	private loadQueueMetadata(): void {
		try {
			const stored = localStorage.getItem(this.storageKey);
			if (!stored) return;

			const data = JSON.parse(stored) as {
				trackedJobIds: string[];
				lastQueuedJobId: string | null;
			};

			this.trackedJobIds.set(data.trackedJobIds || []);
			this.lastQueuedJobId.set(data.lastQueuedJobId || null);

			if (data.trackedJobIds?.length) {
				this.startRealtimeTracking();
			}
		} catch (error) {
			console.warn('Failed to restore upload queue metadata:', error);
		}
	}

	// Metadata persistence is best-effort because queue UX should still function in private mode.
	private saveQueueMetadata(): void {
		try {
			localStorage.setItem(
				this.storageKey,
				JSON.stringify({
					trackedJobIds: this.trackedJobIds(),
					lastQueuedJobId: this.lastQueuedJobId(),
				}),
			);
		} catch (error) {
			console.warn('Failed to save upload queue metadata:', error);
		}
	}

	// Files are normalized into queue items immediately so the UI can edit metadata before upload starts.
	addFiles(files: File[]): void {
		if (files.length === 0) {
			return;
		}

		const queued = this.queue();
		const next = files.map((file, index) => createQueueItem(file, index));
		this.queue.set([...queued, ...next]);
		this.error.set(null);
	}

	setError(message: string | null): void {
		this.error.set(message);
	}

	updateItemLanguage(itemId: string, language: 'fr' | 'en'): void {
		this.queue.update((items) => patchQueueItemById(items, itemId, (item) => ({ ...item, language })));
	}

	updateMp3Cover(itemId: string, coverFile: File | null): void {
		this.queue.update((items) =>
			patchQueueItemById(items, itemId, (item) => {
				if (item.type !== 'mp3' || !item.mp3) {
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
		this.saveQueueMetadata();
	}

	// Queue processing is serialized because the worker/backend already handles the heavy parallelism.
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

	// Uploads advance recursively so completion/failure handling stays in one place.
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
		this.queue.set(patchQueueItem(this.queue(), index, patch));
	}

	// Once a backend job exists, realtime tracking becomes the authoritative source of status.
	private trackJob(jobId: string): void {
		if (!this.trackedJobIds().includes(jobId)) {
			this.trackedJobIds.update((ids) => [...ids, jobId]);
		}
		this.saveQueueMetadata();
		this.startRealtimeTracking();
	}

	// Realtime tracking is lazy-started and auto-stops when every tracked job reaches a terminal state.
	private startRealtimeTracking(): void {
		if (this.jobsStreamHandle) {
			return;
		}

		this.jobsStreamHandle = this.admin.startJobsStream({
			onJobs: (jobs) => {
				this.jobsById.update((current) => mergeTrackedJobs(current, jobs, this.trackedJobIds()));

				const allTerminal = allTrackedJobsTerminal(this.trackedJobIds(), this.jobsById());

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
