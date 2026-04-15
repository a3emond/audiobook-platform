import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  signal,
} from '@angular/core';
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
  readonly error = signal<string | null>(null);
  readonly selectedLevel = signal('');
  readonly autoRefresh = signal(false);

  private refreshInterval?: ReturnType<typeof setInterval>;
  private readonly pageSize = 100;

  constructor(private readonly admin: AdminService) {}

  ngOnInit(): void {
    if (this.jobId) {
      this.refreshLogs();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['jobId']) {
      // Stop any running auto-refresh for the previous job
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = undefined;
        this.autoRefresh.set(false);
      }
      this.offset.set(0);
      this.logs.set([]);
      this.error.set(null);
      if (this.jobId) {
        this.refreshLogs();
      }
    }
  }

  refreshLogs(): void {
    if (!this.jobId) return;

    this.loading.set(true);
    this.error.set(null);
    const level = this.selectedLevel() || undefined;

    this.admin
      .getJobLogs(this.jobId, { limit: this.pageSize, offset: 0, level: level as any })
      .subscribe({
        next: (response) => {
          this.logs.set(response.logs.map((log) => this.normalizeLog(log)));
          this.total.set(response.total);
          this.offset.set(0);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Could not load job logs.');
          this.logs.set([]);
          this.total.set(0);
          this.loading.set(false);
        },
      });
  }

  loadMore(): void {
    if (!this.jobId || this.loading()) return;
    if (this.logs().length >= this.total()) return;

    this.loading.set(true);
    this.error.set(null);
    const nextOffset = this.logs().length;
    const level = this.selectedLevel() || undefined;

    this.admin
      .getJobLogs(this.jobId, { limit: this.pageSize, offset: nextOffset, level: level as any })
      .subscribe({
        next: (response) => {
          this.logs.set([...this.logs(), ...response.logs.map((log) => this.normalizeLog(log))]);
          this.total.set(response.total);
          this.offset.set(nextOffset);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Could not load more logs.');
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

    // Always clear before potentially re-arming so rapid toggles cannot leak an orphaned interval.
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }

    if (!current) {
      this.refreshInterval = setInterval(() => this.refreshLogs(), 2000);
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

  private normalizeLog(log: JobLog | (Partial<JobLog> & { ts?: string })): JobLog {
    const timestamp =
      log.timestamp ?? ('ts' in log ? log.ts : undefined) ?? new Date().toISOString();
    const level = log.level ?? 'info';
    const message = log.message ?? '';
    return {
      timestamp,
      level: level as JobLog['level'],
      message,
      context: log.context,
      duration: log.duration,
    };
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }
}
