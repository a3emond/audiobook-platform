import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';

import { AdminJob, AdminService, JobEventStreamHandle } from '../../core/services/admin.service';

@Component({
	selector: 'app-admin-jobs-page',
	standalone: true,
	imports: [CommonModule],
	template: `
		<section class="admin-page page-shell">
			<h1>Admin Jobs</h1>
			<p *ngIf="!connected()">Connecting websocket...</p>
			<p *ngIf="connected()">Mode: {{ mode() === 'stream' ? 'Realtime websocket' : 'Polling fallback' }}</p>
			<p *ngIf="error()" class="error">{{ error() }}</p>

			<table *ngIf="jobs().length > 0" class="admin-table">
				<thead>
					<tr><th>Type</th><th>Status</th><th>Updated</th></tr>
				</thead>
				<tbody>
					<tr *ngFor="let job of jobs()">
						<td>{{ job.type }}</td>
						<td>{{ job.status }}</td>
						<td>{{ job.updatedAt || '-' }}</td>
					</tr>
				</tbody>
			</table>
		</section>
	`,
	styles: [
		`
			.admin-page { display: grid; gap: 0.9rem; }
			.admin-table { width: 100%; border-collapse: collapse; background: var(--color-surface); }
			.admin-table th, .admin-table td { border: 1px solid var(--color-border); padding: 0.45rem; text-align: left; }
			.admin-table th { background: #1a1a1a; color: var(--color-text-muted); }
			.error { color: var(--color-danger); }
		`,
	],
})
export class AdminJobsPage implements OnInit, OnDestroy {
	readonly jobs = signal<AdminJob[]>([]);
	readonly connected = signal(false);
	readonly mode = signal<'stream' | 'poll'>('stream');
	readonly error = signal<string | null>(null);

	private streamHandle?: JobEventStreamHandle;

	constructor(private readonly admin: AdminService) {}

	ngOnInit(): void {
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

				this.jobs.set(Array.from(merged.values()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
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

	ngOnDestroy(): void {
		this.streamHandle?.stop();
	}
}
