import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminJob, AdminService, JobEventStreamHandle, WorkerQueueSettings } from '../../core/services/admin.service';
import { AdminJobLogsComponent } from './admin-job-logs.component';

@Component({
selector: 'app-admin-jobs-page',
standalone: true,
imports: [CommonModule, FormsModule, AdminJobLogsComponent],
template: `
		<div class="admin-page">
			<h1>Admin Jobs</h1>
			<p *ngIf="!connected()">Connecting websocket...</p>
			<p *ngIf="connected()">Mode: {{ mode() === 'stream' ? 'Realtime websocket' : 'Polling fallback' }}</p>
			<p *ngIf="error()" class="error">{{ error() }}</p>

			<section class="settings-panel" *ngIf="settingsDraft() as s">
				<h3>Worker Queue Settings</h3>
				<p class="settings-help">
					Heavy jobs can be delayed and restricted to a time window (server local time).
				</p>
				<div class="settings-grid">
					<label>
						<span>Heavy job delay (ms)</span>
						<input type="number" min="0" [(ngModel)]="s.heavyJobDelayMs" />
					</label>

					<label class="checkbox-row">
						<input type="checkbox" [(ngModel)]="s.heavyWindowEnabled" />
						<span>Restrict heavy jobs to a time window</span>
					</label>

					<label>
						<span>Window start</span>
						<input type="time" [(ngModel)]="s.heavyWindowStart" [disabled]="!s.heavyWindowEnabled" />
					</label>

					<label>
						<span>Window end</span>
						<input type="time" [(ngModel)]="s.heavyWindowEnd" [disabled]="!s.heavyWindowEnabled" />
					</label>

					<div class="checkbox-group">
						<span class="group-label">Mark job types as "heavy" (subject to delay &amp; time window)</span>
						<label class="checkbox-row" *ngFor="let type of allJobTypes">
							<input type="checkbox"
								[checked]="s.heavyJobTypes.includes(type)"
								(change)="toggleHeavyType(s, type, $any($event.target).checked)" />
							<span>{{ type }}</span>
						</label>
					</div>
				</div>

				<div class="actions">
					<button type="button" (click)="saveWorkerSettings()" [disabled]="savingSettings()">
						{{ savingSettings() ? 'Saving...' : 'Save worker settings' }}
					</button>
					<button type="button" class="ghost" (click)="reloadWorkerSettings()" [disabled]="savingSettings()">
						Reload
					</button>
				</div>
				<p *ngIf="settingsMessage()" class="settings-message">{{ settingsMessage() }}</p>
			</section>

			<div class="jobs-container">
				<div class="jobs-list">
					<h3>Jobs Queue</h3>
					<table *ngIf="jobs().length > 0" class="admin-table">
						<thead>
							<tr>
								<th>Type</th>
								<th>Status</th>
								<th>Progress</th>
								<th>Updated</th>
							</tr>
						</thead>
						<tbody>
							<tr *ngFor="let job of jobs()" 
								(click)="selectJob(job)"
								[class.selected]="selectedJobId() === job.id"
								class="clickable">
								<td>{{ job.type }}</td>
								<td>
									<span class="badge" [class]="'status-' + job.status">{{ job.status }}</span>
								</td>
								<td>{{ job.attempt }}/{{ job.maxAttempts }}</td>
								<td>{{ job.updatedAt || '-' }}</td>
							</tr>
						</tbody>
					</table>
					<p *ngIf="jobs().length === 0" class="empty">No jobs</p>
				</div>

				<div class="job-detail" *ngIf="selectedJobId()">
					<app-admin-job-logs [jobId]="selectedJobId()!"></app-admin-job-logs>
				</div>
			</div>
		</div>
	`,
styles: [
`
			.admin-page {
				display: grid;
				gap: 0.9rem;
			}

			.jobs-container {
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 1rem;
			}

			.jobs-list {
				display: flex;
				flex-direction: column;
				gap: 0.5rem;
			}

			.jobs-list h3 {
				margin: 0;
				font-size: 1rem;
			}

			.admin-table {
				width: 100%;
				border-collapse: collapse;
				background: var(--color-surface);
				font-size: 0.9rem;
			}

			.admin-table th,
			.admin-table td {
				border: 1px solid var(--color-border);
				padding: 0.45rem;
				text-align: left;
			}

			.admin-table th {
				background: #1a1a1a;
				color: var(--color-text-muted);
			}

			.admin-table tbody tr {
				cursor: pointer;
			}

			.admin-table tbody tr.clickable:hover {
				background: rgba(100, 150, 255, 0.1);
			}

			.admin-table tbody tr.selected {
				background: rgba(100, 150, 255, 0.2);
				border: 2px solid var(--color-primary);
			}

			.badge {
				display: inline-block;
				padding: 0.2rem 0.5rem;
				border-radius: 0.25rem;
				font-size: 0.8rem;
				font-weight: bold;
				text-transform: uppercase;
			}

			.status-queued {
				background: rgba(100, 150, 255, 0.3);
				color: #64c8ff;
			}

			.status-running {
				background: rgba(100, 200, 100, 0.3);
				color: #64ff64;
			}

			.status-done {
				background: rgba(100, 200, 100, 0.3);
				color: #64ff64;
			}

			.status-failed {
				background: rgba(255, 100, 100, 0.3);
				color: #ff6464;
			}

			.status-retrying {
				background: rgba(255, 200, 100, 0.3);
				color: #ffc864;
			}

			.job-detail {
				display: flex;
				flex-direction: column;
				gap: 0.5rem;
			}

			.error {
				color: var(--color-danger);
			}

			.empty {
				color: var(--color-text-muted);
				text-align: center;
				padding: 1rem;
			}

			.settings-panel {
				display: grid;
				gap: 0.65rem;
				background: var(--color-surface);
				border: 1px solid var(--color-border);
				padding: 0.8rem;
				border-radius: 0.4rem;
			}

			.settings-panel h3 {
				margin: 0;
				font-size: 1rem;
			}

			.settings-help {
				margin: 0;
				color: var(--color-text-muted);
				font-size: 0.9rem;
			}

			.settings-grid {
				display: grid;
				grid-template-columns: repeat(2, minmax(220px, 1fr));
				gap: 0.6rem;
			}

			.settings-grid label {
				display: grid;
				gap: 0.3rem;
				font-size: 0.9rem;
			}

			.settings-grid input,
			.settings-grid select {
				padding: 0.4rem;
				border: 1px solid var(--color-border);
				border-radius: 0.3rem;
				background: #101113;
				color: var(--color-text);
			}

			.checkbox-row {
				display: flex !important;
				align-items: center;
				gap: 0.45rem;
			}

			.actions {
				display: flex;
				gap: 0.5rem;
			}

			.actions button {
				padding: 0.4rem 0.7rem;
				border-radius: 0.3rem;
				border: 1px solid var(--color-border);
				background: var(--color-primary);
				color: #111;
				cursor: pointer;
			}

			.actions button.ghost {
				background: transparent;
				color: var(--color-text);
			}

			.settings-message {
				margin: 0;
				font-size: 0.9rem;
				color: var(--color-text-muted);
			}

			@media (max-width: 1200px) {
				.jobs-container {
					grid-template-columns: 1fr;
				}

				.settings-grid {
					grid-template-columns: 1fr;
				}
			}
		`,
],
})
export class AdminJobsPage implements OnInit, OnDestroy {
	readonly jobs = signal<AdminJob[]>([]);
	readonly connected = signal(false);
	readonly mode = signal<'stream' | 'poll'>('stream');
	readonly error = signal<string | null>(null);
	readonly selectedJobId = signal<string | null>(null);
	readonly settingsDraft = signal<WorkerQueueSettings | null>(null);
	readonly savingSettings = signal(false);
	readonly settingsMessage = signal<string | null>(null);
	readonly allJobTypes: WorkerQueueSettings['heavyJobTypes'] = [
		'INGEST',
		'INGEST_MP3_AS_M4B',
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

	toggleHeavyType(draft: WorkerQueueSettings, type: WorkerQueueSettings['heavyJobTypes'][number], checked: boolean): void {
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
				this.settingsDraft.set({
heavyJobTypes: [...settings.queue.heavyJobTypes],
heavyJobDelayMs: settings.queue.heavyJobDelayMs,
heavyWindowEnabled: settings.queue.heavyWindowEnabled,
heavyWindowStart: settings.queue.heavyWindowStart,
heavyWindowEnd: settings.queue.heavyWindowEnd,
});
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
		this.admin.updateWorkerSettings({ queue: draft }).subscribe({
next: (saved) => {
				this.savingSettings.set(false);
				this.settingsDraft.set({
heavyJobTypes: [...saved.queue.heavyJobTypes],
heavyJobDelayMs: saved.queue.heavyJobDelayMs,
heavyWindowEnabled: saved.queue.heavyWindowEnabled,
heavyWindowStart: saved.queue.heavyWindowStart,
heavyWindowEnd: saved.queue.heavyWindowEnd,
});
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
}
