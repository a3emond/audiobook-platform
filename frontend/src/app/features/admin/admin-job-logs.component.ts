import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, type JobLog } from '../../core/services/admin.service';

@Component({
	selector: 'app-admin-job-logs',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<div class="logs-container">
			<div class="logs-header">
				<h3>Job Logs</h3>
				<div class="logs-controls">
					<select [(ngModel)]="selectedLevel" (change)="onLevelChange()" class="log-filter">
						<option value="">All Levels</option>
						<option value="debug">Debug</option>
						<option value="info">Info</option>
						<option value="warn">Warn</option>
						<option value="error">Error</option>
					</select>
					<button (click)="refreshLogs()" class="btn-refresh">↻ Refresh</button>
					<button (click)="toggleAutoRefresh()" [class.active]="autoRefresh()" class="btn-toggle">
						{{ autoRefresh() ? '⏸ Pause' : '▶ Auto' }}
					</button>
				</div>
			</div>

			<div class="logs-content">
				<div *ngIf="loading()" class="loading">Loading logs...</div>
				<div *ngIf="!loading() && logs().length === 0" class="empty">No logs found</div>

				<table *ngIf="logs().length > 0" class="logs-table">
					<thead>
						<tr>
							<th>Time</th>
							<th>Level</th>
							<th>Message</th>
							<th>Duration</th>
						</tr>
					</thead>
					<tbody>
						<tr *ngFor="let log of logs()" [class]="'log-' + log.level">
							<td class="time">{{ formatTime(log.timestamp) }}</td>
							<td class="level">
								<span class="badge" [class]="'badge-' + log.level">{{ log.level }}</span>
							</td>
							<td class="message">{{ log.message }}</td>
							<td class="duration">{{ log.duration ? (log.duration + 'ms') : '-' }}</td>
						</tr>
					</tbody>
				</table>
			</div>

			<div *ngIf="total() > logs().length" class="logs-pagination">
				<button (click)="loadMore()" class="btn-load-more">Load More ({{ offset() + logs().length }} / {{ total() }})</button>
			</div>
		</div>
	`,
	styles: [
		`
			.logs-container {
				display: flex;
				flex-direction: column;
				gap: 1rem;
				padding: 1rem;
				background: var(--color-surface);
				border-radius: 0.5rem;
				border: 1px solid var(--color-border);
			}

			.logs-header {
				display: flex;
				justify-content: space-between;
				align-items: center;
				gap: 1rem;
			}

			.logs-header h3 {
				margin: 0;
				font-size: 1rem;
			}

			.logs-controls {
				display: flex;
				gap: 0.5rem;
				align-items: center;
			}

			.log-filter,
			.btn-refresh,
			.btn-toggle {
				padding: 0.4rem 0.8rem;
				border: 1px solid var(--color-border);
				background: var(--color-background);
				color: var(--color-text);
				border-radius: 0.25rem;
				cursor: pointer;
				font-size: 0.9rem;
			}

			.log-filter:hover,
			.btn-refresh:hover,
			.btn-toggle:hover {
				border-color: var(--color-primary);
			}

			.btn-toggle.active {
				background: var(--color-primary);
				color: white;
			}

			.logs-content {
				max-height: 500px;
				overflow-y: auto;
				border: 1px solid var(--color-border);
				border-radius: 0.25rem;
				background: var(--color-background);
			}

			.loading,
			.empty {
				padding: 1rem;
				text-align: center;
				color: var(--color-text-muted);
			}

			.logs-table {
				width: 100%;
				border-collapse: collapse;
				font-size: 0.9rem;
				font-family: monospace;
			}

			.logs-table th {
				background: #1a1a1a;
				color: var(--color-text-muted);
				padding: 0.5rem;
				text-align: left;
				border-bottom: 1px solid var(--color-border);
				position: sticky;
				top: 0;
			}

			.logs-table td {
				padding: 0.4rem 0.5rem;
				border-bottom: 1px solid #333;
			}

			/* Log level styles */
			.log-debug { background: rgba(100, 100, 255, 0.05); }
			.log-info { background: rgba(100, 200, 100, 0.05); }
			.log-warn { background: rgba(255, 200, 100, 0.05); }
			.log-error { background: rgba(255, 100, 100, 0.05); }

			.log-debug .badge { color: #6464ff; }
			.log-info .badge { color: #64c864; }
			.log-warn .badge { color: #ffc864; }
			.log-error .badge { color: #ff6464; }

			.time {
				width: 150px;
				white-space: nowrap;
				color: var(--color-text-muted);
			}

			.level {
				width: 80px;
			}

			.badge {
				display: inline-block;
				padding: 0.2rem 0.5rem;
				border-radius: 0.2rem;
				background: rgba(255, 255, 255, 0.1);
				font-weight: bold;
				font-size: 0.8rem;
				text-transform: uppercase;
			}

			.message {
				flex: 1;
				word-break: break-word;
			}

			.duration {
				width: 80px;
				text-align: right;
				color: var(--color-text-muted);
			}

			.logs-pagination {
				text-align: center;
				padding: 0.5rem;
			}

			.btn-load-more {
				padding: 0.5rem 1rem;
				background: var(--color-primary);
				color: white;
				border: none;
				border-radius: 0.25rem;
				cursor: pointer;
				font-size: 0.9rem;
			}

			.btn-load-more:hover {
				background: var(--color-primary-dark);
			}
		`,
	],
})
export class AdminJobLogsComponent implements OnInit, OnChanges, OnDestroy {
	@Input()
	jobId!: string;

	readonly logs = signal<JobLog[]>([]);
	readonly total = signal(0);
	readonly offset = signal(0);
	readonly loading = signal(false);
	readonly selectedLevel = signal('');
	readonly autoRefresh = signal(false);

	private refreshInterval?: ReturnType<typeof setInterval>;
	private readonly pageSize = 100;

	constructor(private readonly admin: AdminService) {}

	ngOnInit(): void {
		this.refreshLogs();
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['jobId'] && !changes['jobId'].isFirstChange()) {
			// Stop any running auto-refresh for the previous job
			if (this.refreshInterval) {
				clearInterval(this.refreshInterval);
				this.refreshInterval = undefined;
				this.autoRefresh.set(false);
			}
			this.offset.set(0);
			this.logs.set([]);
			this.refreshLogs();
		}
	}

	refreshLogs(): void {
		if (!this.jobId) return;

		this.loading.set(true);
		const level = this.selectedLevel() || undefined;

		this.admin.getJobLogs(this.jobId, { limit: this.pageSize, offset: 0, level: level as any }).subscribe({
			next: (response) => {
				this.logs.set(response.logs);
				this.total.set(response.total);
				this.offset.set(0);
				this.loading.set(false);
			},
			error: () => {
				this.loading.set(false);
			},
		});
	}

	loadMore(): void {
		if (!this.jobId) return;

		this.loading.set(true);
		const nextOffset = this.offset() + this.logs().length;
		const level = this.selectedLevel() || undefined;

		this.admin.getJobLogs(this.jobId, { limit: this.pageSize, offset: nextOffset, level: level as any }).subscribe({
			next: (response) => {
				this.logs.set([...this.logs(), ...response.logs]);
				this.offset.set(nextOffset);
				this.loading.set(false);
			},
			error: () => {
				this.loading.set(false);
			},
		});
	}

	onLevelChange(): void {
		this.refreshLogs();
	}

	toggleAutoRefresh(): void {
		const current = this.autoRefresh();
		this.autoRefresh.set(!current);

		if (!current) {
			// Start auto-refresh
			this.refreshInterval = setInterval(() => this.refreshLogs(), 2000);
		} else {
			// Stop auto-refresh
			if (this.refreshInterval) {
				clearInterval(this.refreshInterval);
			}
		}
	}

	formatTime(timestamp: string): string {
		const date = new Date(timestamp);
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');
		const ms = String(date.getMilliseconds()).padStart(3, '0');
		return `${hours}:${minutes}:${seconds}.${ms}`;
	}

	ngOnDestroy(): void {
		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
		}
	}
}
