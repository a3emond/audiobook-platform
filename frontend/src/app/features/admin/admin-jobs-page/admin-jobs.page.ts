import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminJob, AdminService, JobEventStreamHandle, WorkerQueueSettings, WorkerSettings } from '../../../core/services/admin.service';
import { AdminJobLogsComponent } from '../admin-job-logs/admin-job-logs.component';

interface WorkerSettingsDraft extends WorkerQueueSettings {
	parityEnabled: boolean;
	parityIntervalMinutes: number;
}

@Component({
selector: 'app-admin-jobs-page',
standalone: true,
imports: [CommonModule, FormsModule, AdminJobLogsComponent],
templateUrl: './admin-jobs.page.html',
styleUrl: './admin-jobs.page.css',
})
// Main UI/state logic for this standalone view component.
export class AdminJobsPage implements OnInit, OnDestroy {
	readonly jobs = signal<AdminJob[]>([]);
	readonly connected = signal(false);
	readonly mode = signal<'stream' | 'poll'>('stream');
	readonly error = signal<string | null>(null);
	readonly selectedJobId = signal<string | null>(null);
	readonly settingsDraft = signal<WorkerSettingsDraft | null>(null);
	readonly savingSettings = signal(false);
	readonly settingsMessage = signal<string | null>(null);
	readonly allJobTypes: WorkerQueueSettings['heavyJobTypes'] = [
		'INGEST',
		'INGEST_MP3_AS_M4B',
		'SANITIZE_MP3_TO_M4B',
		'RESCAN',
		'WRITE_METADATA',
		'EXTRACT_COVER',
		'REPLACE_COVER',
		'DELETE_BOOK',
		'REPLACE_FILE',
	];

	private streamHandle?: JobEventStreamHandle;

	constructor(private readonly admin: AdminService) {}

	ngOnInit(): void {
		this.reloadWorkerSettings();

		this.admin.listJobs(25, 0).subscribe({
next: (response) => this.jobs.set(response.jobs),
			error: () => this.jobs.set([]),
		});

		this.streamHandle = this.admin.startJobsStream({
onJobs: (jobs) => {
				if (jobs.length === 0) {
					return;
				}

				const merged = new Map(this.jobs().map((job) => [job.id, job]));
				for (const job of jobs) {
					merged.set(job.id, job);
				}

				this.jobs.set(
Array.from(merged.values()).sort((a, b) =>
						(b.updatedAt || '').localeCompare(a.updatedAt || ''),
					),
				);
			},
			onConnectionState: (connected, mode) => {
				this.connected.set(connected);
				this.mode.set(mode);
			},
			onError: (message) => {
				this.error.set(message);
			},
		});
	}

	selectJob(job: AdminJob): void {
		this.selectedJobId.set(job.id);
	}

	toggleHeavyType(draft: WorkerSettingsDraft, type: WorkerQueueSettings['heavyJobTypes'][number], checked: boolean): void {
		if (checked) {
			if (!draft.heavyJobTypes.includes(type)) draft.heavyJobTypes = [...draft.heavyJobTypes, type];
		} else {
			draft.heavyJobTypes = draft.heavyJobTypes.filter(t => t !== type);
		}
	}

	reloadWorkerSettings(): void {
		this.settingsMessage.set(null);
		this.admin.getWorkerSettings().subscribe({
next: (settings) => {
				this.settingsDraft.set(this.toDraft(settings));
			},
			error: () => this.settingsMessage.set('Could not load worker settings'),
		});
	}

	saveWorkerSettings(): void {
		const draft = this.settingsDraft();
		if (!draft) {
			return;
		}

		this.savingSettings.set(true);
		this.settingsMessage.set(null);
		this.admin.updateWorkerSettings(this.fromDraft(draft)).subscribe({
next: (saved) => {
				this.savingSettings.set(false);
				this.settingsDraft.set(this.toDraft(saved));
				this.settingsMessage.set('Worker settings saved');
			},
			error: () => {
				this.savingSettings.set(false);
				this.settingsMessage.set('Save failed. Check values and try again.');
			},
		});
	}

	ngOnDestroy(): void {
		this.streamHandle?.stop();
	}

	private toDraft(settings: WorkerSettings): WorkerSettingsDraft {
		return {
			heavyJobTypes: [...settings.queue.heavyJobTypes],
			heavyJobDelayMs: settings.queue.heavyJobDelayMs,
			heavyWindowEnabled: settings.queue.heavyWindowEnabled,
			heavyWindowStart: settings.queue.heavyWindowStart,
			heavyWindowEnd: settings.queue.heavyWindowEnd,
			heavyConcurrency: settings.queue.heavyConcurrency,
			fastConcurrency: settings.queue.fastConcurrency,
			parityEnabled: settings.parity.enabled,
			parityIntervalMinutes: Math.max(1, Math.round(settings.parity.intervalMs / 60_000)),
		};
	}

	private fromDraft(draft: WorkerSettingsDraft): Partial<WorkerSettings> {
		return {
			queue: {
				heavyJobTypes: [...draft.heavyJobTypes],
				heavyJobDelayMs: draft.heavyJobDelayMs,
				heavyWindowEnabled: draft.heavyWindowEnabled,
				heavyWindowStart: draft.heavyWindowStart,
				heavyWindowEnd: draft.heavyWindowEnd,
				heavyConcurrency: draft.heavyConcurrency,
				fastConcurrency: draft.fastConcurrency,
			},
			parity: {
				enabled: draft.parityEnabled,
				intervalMs: Math.max(60_000, Math.round(draft.parityIntervalMinutes) * 60_000),
			},
		};
	}
}
