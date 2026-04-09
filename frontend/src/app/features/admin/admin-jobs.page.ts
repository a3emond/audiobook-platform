import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminJob, AdminService, JobEventStreamHandle, WorkerQueueSettings, WorkerSettings } from '../../core/services/admin.service';
import { AdminJobLogsComponent } from './admin-job-logs.component';

interface WorkerSettingsDraft extends WorkerQueueSettings {
	parityEnabled: boolean;
	parityIntervalMinutes: number;
}

@Component({
selector: 'app-admin-jobs-page',
standalone: true,
imports: [CommonModule, FormsModule, AdminJobLogsComponent],
template: `
	<div class="admin-page">

		<!-- Page header -->
		<div class="page-hd">
			<h1>Jobs &amp; Queue</h1>
			<span class="conn-badge" [class.online]="connected()">
				<span class="conn-dot"></span>
				{{ connected() ? (mode() === 'stream' ? 'Live' : 'Polling') : 'Offline' }}
			</span>
		</div>
		<p *ngIf="error()" class="text-error">{{ error() }}</p>

		<!-- ── Worker Queue Settings ────────────────────────────── -->
		<section class="settings-panel" *ngIf="settingsDraft() as s">
			<div class="settings-header">
				<h2 class="settings-title">Worker Queue Settings</h2>
				<p class="settings-help">Configure queue lanes and the automated parity scan loop.</p>
			</div>

			<!-- Scheduling controls -->
			<div class="schedule-row">
				<label class="field">
					<span class="field-label">Heavy slots</span>
					<input type="number" min="1" max="16" class="field-input narrow" [(ngModel)]="s.heavyConcurrency" />
				</label>

				<label class="field">
					<span class="field-label">Fast slots</span>
					<input type="number" min="0" max="16" class="field-input narrow" [(ngModel)]="s.fastConcurrency" />
				</label>

				<label class="field">
					<span class="field-label">Delay (ms)</span>
					<input type="number" min="0" class="field-input narrow" [(ngModel)]="s.heavyJobDelayMs" />
				</label>

				<div class="toggle-field">
					<span class="field-label">Time window</span>
					<div class="toggle-row">
						<button type="button" class="toggle-switch" [class.on]="s.heavyWindowEnabled"
							[attr.aria-checked]="s.heavyWindowEnabled" role="switch"
							(click)="s.heavyWindowEnabled = !s.heavyWindowEnabled">
							<span class="toggle-thumb"></span>
						</button>
						<span class="toggle-hint">{{ s.heavyWindowEnabled ? 'Enabled' : 'Disabled' }}</span>
					</div>
				</div>

				<label class="field" [class.faded]="!s.heavyWindowEnabled">
					<span class="field-label">Start</span>
					<input type="time" class="field-input" [(ngModel)]="s.heavyWindowStart" [disabled]="!s.heavyWindowEnabled" />
				</label>

				<label class="field" [class.faded]="!s.heavyWindowEnabled">
					<span class="field-label">End</span>
					<input type="time" class="field-input" [(ngModel)]="s.heavyWindowEnd" [disabled]="!s.heavyWindowEnabled" />
				</label>
			</div>

			<div class="parity-row">
				<div class="toggle-field">
					<span class="field-label">Parity scan</span>
					<div class="toggle-row">
						<button type="button" class="toggle-switch" [class.on]="s.parityEnabled"
							[attr.aria-checked]="s.parityEnabled" role="switch"
							(click)="s.parityEnabled = !s.parityEnabled">
							<span class="toggle-thumb"></span>
						</button>
						<span class="toggle-hint">{{ s.parityEnabled ? 'Enabled' : 'Disabled' }}</span>
					</div>
				</div>

				<label class="field" [class.faded]="!s.parityEnabled">
					<span class="field-label">Every (min)</span>
					<input type="number" min="1" class="field-input narrow" [(ngModel)]="s.parityIntervalMinutes" [disabled]="!s.parityEnabled" />
				</label>

				<p class="parity-help">Queues a full rescan on a timer and skips duplicate parity jobs automatically.</p>
			</div>

			<!-- Heavy job type chips -->
			<div class="types-section">
				<span class="field-label">Heavy job types <span class="types-hint">(click to toggle)</span></span>
				<div class="type-chips">
					<button type="button" class="type-chip" *ngFor="let type of allJobTypes"
						[class.selected]="s.heavyJobTypes.includes(type)"
						(click)="toggleHeavyType(s, type, !s.heavyJobTypes.includes(type))">
						{{ type }}
					</button>
				</div>
			</div>

			<!-- Actions -->
			<div class="settings-footer">
				<button type="button" class="btn-save" (click)="saveWorkerSettings()" [disabled]="savingSettings()">
					{{ savingSettings() ? 'Saving…' : 'Save settings' }}
				</button>
				<button type="button" class="btn-ghost" (click)="reloadWorkerSettings()" [disabled]="savingSettings()">Reload</button>
				<span *ngIf="settingsMessage()" class="settings-msg">{{ settingsMessage() }}</span>
			</div>
		</section>

		<!-- ── Jobs queue + log detail ──────────────────────────── -->
		<div class="jobs-pane">
			<div class="jobs-list">
				<p class="pane-label">Jobs Queue</p>
				<table *ngIf="jobs().length > 0" class="jobs-table">
					<thead>
						<tr>
							<th>Type</th>
							<th>Status</th>
							<th>Attempts</th>
							<th>Updated</th>
						</tr>
					</thead>
					<tbody>
						<tr *ngFor="let job of jobs()"
							(click)="selectJob(job)"
							[class.selected]="selectedJobId() === job.id">
							<td class="type-cell">{{ job.type }}</td>
							<td><span class="badge" [class]="'status-' + job.status">{{ job.status }}</span></td>
							<td class="dim-cell">{{ job.attempt }}/{{ job.maxAttempts }}</td>
							<td class="dim-cell">{{ job.updatedAt | date:'HH:mm:ss' }}</td>
						</tr>
					</tbody>
				</table>
				<p *ngIf="jobs().length === 0" class="empty-hint">No jobs in queue</p>
			</div>

			<div class="logs-pane" *ngIf="selectedJobId(); else noSelection">
				<app-admin-job-logs [jobId]="selectedJobId()!"></app-admin-job-logs>
			</div>
			<ng-template #noSelection>
				<div class="no-selection">Select a job to view its logs</div>
			</ng-template>
		</div>

	</div>
`,
styles: [
`
	.admin-page {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	/* Page header */
	.page-hd {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.page-hd h1 {
		margin: 0;
		font-size: 1.35rem;
		font-weight: 700;
	}
	.conn-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.22rem 0.6rem;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		background: rgba(255 255 255 / 0.05);
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
	}
	.conn-badge.online {
		color: var(--color-success);
		border-color: rgba(52 211 153 / 0.35);
		background: rgba(52 211 153 / 0.08);
	}
	.conn-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
		flex-shrink: 0;
	}
	.conn-badge.online .conn-dot { box-shadow: 0 0 5px currentColor; }
	.text-error { color: var(--color-danger); font-size: 0.875rem; margin: 0; }

	/* ── Settings panel ─────────────────────────────────────── */
	.settings-panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius, 0.5rem);
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.settings-header { display: flex; flex-direction: column; gap: 0.15rem; }
	.settings-title { margin: 0; font-size: 0.9rem; font-weight: 600; }
	.settings-help { margin: 0; font-size: 0.8rem; color: var(--color-text-muted); }
	.parity-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 1rem;
	}
	.parity-help {
		margin: 0;
		font-size: 0.78rem;
		color: var(--color-text-muted);
		max-width: 34rem;
	}

	.field-label {
		display: block;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--color-text-muted);
		font-weight: 600;
	}
	.types-hint {
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
		opacity: 0.6;
	}

	/* Scheduling row */
	.schedule-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 1rem;
	}
	.field { display: flex; flex-direction: column; gap: 0.3rem; }
	.field-input {
		padding: 0.42rem 0.65rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm, 0.25rem);
		background: #0c0c0f;
		color: var(--color-text);
		font-size: 0.875rem;
		min-width: 0;
		transition: border-color 0.15s;
	}
	.field-input:focus { border-color: var(--color-accent); outline: none; }
	.field-input.narrow { width: 8rem; }
	.faded { opacity: 0.38; pointer-events: none; }

	/* Toggle switch */
	.toggle-field { display: flex; flex-direction: column; gap: 0.3rem; }
	.toggle-row { display: flex; align-items: center; gap: 0.55rem; height: 2.1rem; }
	.toggle-hint { font-size: 0.8rem; color: var(--color-text-muted); }
	.toggle-switch {
		position: relative;
		width: 2.4rem;
		height: 1.3rem;
		border-radius: 999px;
		background: #1f1f22;
		border: 1px solid var(--color-border);
		cursor: pointer;
		transition: background 0.18s, border-color 0.18s;
		flex-shrink: 0;
		padding: 0;
	}
	.toggle-switch.on {
		background: var(--color-primary);
		border-color: var(--color-primary);
	}
	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 0.875rem;
		height: 0.875rem;
		border-radius: 50%;
		background: #666;
		transition: transform 0.18s, background 0.18s;
	}
	.toggle-switch.on .toggle-thumb {
		transform: translateX(1.1rem);
		background: #fff;
	}

	/* Job type chips */
	.types-section { display: flex; flex-direction: column; gap: 0.45rem; }
	.type-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
	.type-chip {
		padding: 0.28rem 0.7rem;
		border-radius: 999px;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.71rem;
		font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
		letter-spacing: 0.02em;
		cursor: pointer;
		transition: background 0.12s, color 0.12s, border-color 0.12s;
		white-space: nowrap;
	}
	.type-chip:hover {
		border-color: rgb(255 138 0 / 0.45);
		color: var(--color-text);
		background: rgb(255 138 0 / 0.06);
	}
	.type-chip.selected {
		background: rgb(255 138 0 / 0.14);
		border-color: rgb(255 138 0 / 0.48);
		color: var(--color-primary);
		font-weight: 700;
	}

	/* Settings actions */
	.settings-footer { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.btn-save {
		padding: 0.42rem 0.9rem;
		background: var(--color-primary);
		color: #111;
		border: none;
		border-radius: var(--radius-sm, 0.25rem);
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
		transition: background 0.15s;
	}
	.btn-save:hover { background: var(--color-accent-hover); }
	.btn-save:disabled { opacity: 0.45; cursor: not-allowed; }
	.btn-ghost {
		padding: 0.42rem 0.75rem;
		background: transparent;
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm, 0.25rem);
		font-size: 0.82rem;
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
	}
	.btn-ghost:hover { background: rgb(255 255 255 / 0.05); color: var(--color-text); }
	.btn-ghost:disabled { opacity: 0.45; cursor: not-allowed; }
	.settings-msg { font-size: 0.8rem; color: var(--color-text-muted); margin-left: 0.15rem; }

	/* ── Jobs + logs pane ───────────────────────────────────── */
	.jobs-pane {
		display: grid;
		grid-template-columns: minmax(0, 360px) 1fr;
		gap: 1rem;
		align-items: start;
	}
	.pane-label {
		margin: 0 0 0.55rem;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--color-text-muted);
	}
	.jobs-list { display: flex; flex-direction: column; min-width: 0; }
	.jobs-table {
		width: 100%;
		border-collapse: collapse;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius, 0.5rem);
		overflow: hidden;
		font-size: 0.82rem;
	}
	.jobs-table th {
		background: #161618;
		color: var(--color-text-muted);
		padding: 0.42rem 0.65rem;
		text-align: left;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 600;
		border-bottom: 1px solid var(--color-border);
	}
	.jobs-table td {
		padding: 0.45rem 0.65rem;
		border-bottom: 1px solid rgba(255 255 255 / 0.04);
	}
	.jobs-table tbody tr {
		cursor: pointer;
		transition: background 0.1s;
	}
	.jobs-table tbody tr:hover { background: rgb(255 255 255 / 0.025); }
	.jobs-table tbody tr.selected { background: rgb(255 138 0 / 0.09); }
	.jobs-table tbody tr.selected td { border-bottom-color: rgb(255 138 0 / 0.1); }
	.jobs-table tbody tr:last-child td { border-bottom: none; }
	.type-cell { font-family: ui-monospace, monospace; font-size: 0.75rem; }
	.dim-cell { color: var(--color-text-muted); white-space: nowrap; }

	/* Status badges (pill style) */
	.badge {
		display: inline-block;
		padding: 0.16rem 0.5rem;
		border-radius: 999px;
		font-size: 0.67rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.status-queued   { background: rgba(96 165 250 / 0.15); color: #60a5fa; }
	.status-running  { background: rgba(52 211 153 / 0.15); color: #34d399; }
	.status-done     { background: rgba(74 222 128 / 0.12); color: #4ade80; }
	.status-failed   { background: rgba(248 113 113 / 0.15); color: #f87171; }
	.status-retrying { background: rgba(251 191 36 / 0.15); color: #fbbf24; }

	.empty-hint {
		color: var(--color-text-muted);
		font-size: 0.85rem;
		text-align: center;
		padding: 2rem 1rem;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius, 0.5rem);
	}

	.logs-pane { display: flex; flex-direction: column; min-width: 0; }
	.no-selection {
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius, 0.5rem);
		color: var(--color-text-muted);
		font-size: 0.85rem;
		min-height: 14rem;
	}

	/* Responsive */
	@media (max-width: 900px) {
		.jobs-pane { grid-template-columns: 1fr; }
	}
	@media (max-width: 600px) {
		.schedule-row { flex-direction: column; align-items: stretch; }
		.field-input.narrow { width: 100%; }
	}
`,],
})
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
