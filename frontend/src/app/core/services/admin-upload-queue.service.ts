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
import { createSHA256 } from 'hash-wasm';

import { AdminService } from './admin.service';
import type { AdminJob } from './admin.types';
import {
	allTrackedJobsTerminal,
	createQueueItem,
	mergeTrackedJobs,
	selectAudiobookFiles,
	type PickedFile,
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
	// checking: fingerprinting the file and asking the server whether it has it.
	// skipped: the server already has this exact file, or it is queued twice.
	status: 'checking' | 'queued' | 'skipped' | 'uploading' | 'done' | 'failed';
	jobId?: string;
	error?: string;
	sha256?: string;
	skipReason?: string;
	checkPercent?: number;
	language: 'fr' | 'en';
	mp3?: Mp3QueueMetadata;
	relativePath: string;
	folder: string;
	// Audio files sharing this item's folder; >1 usually means a book split into parts.
	folderAudioCount: number;
}

@Injectable({ providedIn: 'root' })
// AdminUploadQueueService coordinates local upload queue state with backend job
// creation and job-status tracking.
export class AdminUploadQueueService {
	// Queue state is persistent enough to survive refreshes, but file contents remain in memory only.
	private readonly queueState = signal<UploadQueueItem[]>([]);
	readonly queue = this.queueState.asReadonly();
	private readonly loadingState = signal(false);
	readonly loading = this.loadingState.asReadonly();
	private readonly lastQueuedJobIdState = signal<string | null>(null);
	readonly lastQueuedJobId = this.lastQueuedJobIdState.asReadonly();
	private readonly errorState = signal<string | null>(null);
	readonly error = this.errorState.asReadonly();
	private readonly trackedJobIdsState = signal<string[]>([]);
	readonly trackedJobIds = this.trackedJobIdsState.asReadonly();
	private readonly jobsByIdState = signal<Record<string, AdminJob>>({});
	readonly jobsById = this.jobsByIdState.asReadonly();

	private jobsStreamHandle?: { stop: () => void };
	private checkRun: Promise<void> | null = null;
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

			this.trackedJobIdsState.set(data.trackedJobIds || []);
			this.lastQueuedJobIdState.set(data.lastQueuedJobId || null);

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
					trackedJobIds: this.trackedJobIdsState(),
					lastQueuedJobId: this.lastQueuedJobIdState(),
				}),
			);
		} catch (error) {
			console.warn('Failed to save upload queue metadata:', error);
		}
	}

	// Files are normalized into queue items immediately so the UI can edit metadata before upload starts.
	addFiles(files: File[]): void {
		this.addPicked(files.map((file) => ({ file, relativePath: file.webkitRelativePath || file.name })));
	}

	// Accepts whole folder trees: only audiobook files are queued, folder covers
	// are attached to MP3s, and files already queued are skipped.
	addPicked(picked: PickedFile[], language: 'fr' | 'en' = 'en'): { added: number; skipped: number; duplicates: number } {
		const selection = selectAudiobookFiles(picked, this.queueState());
		const next = selection.books.map((book, index) =>
			createQueueItem(book.file, index, {
				relativePath: book.relativePath,
				coverFile: book.coverFile,
				language,
				folderAudioCount: book.folderAudioCount,
			}),
		);
		if (next.length > 0) {
			this.queueState.update((queued) => [...queued, ...next]);
			this.errorState.set(null);
			void this.checkPending();
		}
		return { added: next.length, skipped: selection.skipped, duplicates: selection.duplicates };
	}

	removeItems(itemIds: string[]): void {
		const ids = new Set(itemIds);
		this.queueState.update((items) => items.filter((item) => !ids.has(item.id) || item.status === 'uploading'));
	}

	setAllLanguages(language: 'fr' | 'en'): void {
		this.queueState.update((items) => items.map((item) => (item.status === 'done' ? item : { ...item, language })));
	}

	setError(message: string | null): void {
		this.errorState.set(message);
	}

	updateItemLanguage(itemId: string, language: 'fr' | 'en'): void {
		this.queueState.update((items) => patchQueueItemById(items, itemId, (item) => ({ ...item, language })));
	}

	updateMp3Cover(itemId: string, coverFile: File | null): void {
		this.queueState.update((items) =>
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
		this.queueState.set([]);
		this.lastQueuedJobIdState.set(null);
		this.errorState.set(null);
		this.trackedJobIdsState.set([]);
		this.jobsByIdState.set({});
		this.jobsStreamHandle?.stop();
		this.jobsStreamHandle = undefined;
		this.saveQueueMetadata();
	}

	// Queue processing is serialized because the worker/backend already handles the heavy parallelism.
	// Files still being checked are finished first so known duplicates are never sent.
	async startQueue(): Promise<void> {
		if (this.loadingState()) {
			return;
		}

		this.loadingState.set(true);
		this.errorState.set(null);
		this.lastQueuedJobIdState.set(null);
		await this.checkPending();

		const nextIndex = this.queueState().findIndex((item) => item.status === 'queued' || item.status === 'failed');
		if (nextIndex < 0) {
			this.loadingState.set(false);
			return;
		}
		this.uploadQueueItem(nextIndex);
	}

	private checkPending(): Promise<void> {
		this.checkRun ??= this.runChecks().finally(() => {
			this.checkRun = null;
		});
		return this.checkRun;
	}

	// Fingerprints new files one at a time (SHA-256, the same checksum the worker
	// stores on each book) and skips any the server already has, so a whole
	// folder can be re-dropped without picking out what was imported before.
	private async runChecks(): Promise<void> {
		for (;;) {
			const item = this.queueState().find((entry) => entry.status === 'checking');
			if (!item) {
				return;
			}

			let sha256: string;
			try {
				sha256 = await sha256OfFile(item.file, (percent) => this.patchItem(item.id, { checkPercent: percent }));
			} catch {
				// Unreadable here means the upload would fail too; let it try and report.
				this.patchItem(item.id, { status: 'queued', checkPercent: undefined });
				continue;
			}

			const twin = this.queueState().find(
				(entry) => entry.id !== item.id && entry.sha256 === sha256 && entry.status !== 'skipped',
			);
			if (twin) {
				this.patchItem(item.id, { sha256, status: 'skipped', skipReason: `Same file as ${twin.relativePath}`, checkPercent: undefined });
				continue;
			}

			const verdict = await firstValueFrom(this.admin.preflightUploads([{ key: item.id, sha256 }]))
				.then((response) => response.results[0])
				.catch(() => undefined);
			const skipReason =
				verdict?.status === 'in_library'
					? `Already in library${verdict.title ? `: ${verdict.title}` : ''}`
					: verdict?.status === 'in_queue'
						? 'Already uploaded, waiting to be imported'
						: undefined;
			this.patchItem(item.id, { sha256, status: skipReason ? 'skipped' : 'queued', skipReason, checkPercent: undefined });
		}
	}

	private patchItem(itemId: string, patch: Partial<UploadQueueItem>): void {
		this.queueState.update((items) => patchQueueItemById(items, itemId, (item) => ({ ...item, ...patch })));
	}

	trackedJobs(): AdminJob[] {
		const jobs = this.jobsByIdState();
		return this.trackedJobIdsState()
			.map((id) => jobs[id])
			.filter((job): job is AdminJob => Boolean(job));
	}

	// Uploads advance recursively so completion/failure handling stays in one place.
	private uploadQueueItem(index: number): void {
		const items = this.queueState();
		if (index >= items.length) {
			this.loadingState.set(false);
			return;
		}

		const item = items[index];
		if (!item || item.status === 'done' || item.status === 'skipped') {
			this.uploadQueueItem(index + 1);
			return;
		}

		this.updateQueueItem(index, { status: 'uploading', error: undefined });
		const isMp3 = item.type === 'mp3';

		const request = isMp3
			? this.admin.uploadMp3AsM4b(item.file, item.language, item.mp3?.coverFile ?? null, item.sha256)
			: this.admin.uploadBook(item.file, item.language, item.sha256);

		request.subscribe({
			next: (response) => {
				this.lastQueuedJobIdState.set(response.jobId);
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
				this.errorState.set(message);
				this.uploadQueueItem(index + 1);
			},
		});
	}

	private updateQueueItem(index: number, patch: Partial<UploadQueueItem>): void {
		this.queueState.set(patchQueueItem(this.queueState(), index, patch));
	}

	// Once a backend job exists, realtime tracking becomes the authoritative source of status.
	private trackJob(jobId: string): void {
		if (!this.trackedJobIdsState().includes(jobId)) {
			this.trackedJobIdsState.update((ids) => [...ids, jobId]);
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
				this.jobsByIdState.update((current) => mergeTrackedJobs(current, jobs, this.trackedJobIdsState()));

				const allTerminal = allTrackedJobsTerminal(this.trackedJobIdsState(), this.jobsByIdState());

				if (allTerminal) {
					this.jobsStreamHandle?.stop();
					this.jobsStreamHandle = undefined;
				}
			},
		});

		for (const jobId of this.trackedJobIdsState()) {
			void firstValueFrom(this.admin.getJob(jobId))
				.then((job) => {
					this.jobsByIdState.update((current) => ({ ...current, [job.id]: job }));
				})
				.catch(() => undefined);
		}
	}
}

const HASH_CHUNK_BYTES = 8 * 1024 * 1024;

async function sha256OfFile(file: File, onProgress: (percent: number) => void): Promise<string> {
	const hasher = await createSHA256();
	hasher.init();
	for (let offset = 0; offset < file.size; offset += HASH_CHUNK_BYTES) {
		const chunk = await file.slice(offset, offset + HASH_CHUNK_BYTES).arrayBuffer();
		hasher.update(new Uint8Array(chunk));
		onProgress(Math.floor(((offset + chunk.byteLength) / file.size) * 100));
	}
	return hasher.digest('hex');
}
