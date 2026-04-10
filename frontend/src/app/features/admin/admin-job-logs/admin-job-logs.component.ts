import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, type JobLog } from '../../../core/services/admin.service';

@Component({
	selector: 'app-admin-job-logs',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './admin-job-logs.component.html',
	styleUrl: './admin-job-logs.component.css',
})
// Main UI/state logic for this standalone view component.
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
