import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminService } from '../../../core/services/admin.service';
import type {
  AdminJob,
  JobEventStreamHandle,
  WorkerQueueSettings,
} from '../../../core/services/admin.types';
import { ContentHelpComponent } from '../../../shared/ui/content-help/content-help.component';
import { InfoTooltipComponent } from '../../../shared/ui/info-tooltip/info-tooltip.component';
import { AdminJobLogsComponent } from '../admin-job-logs/admin-job-logs.component';
import {
  fromWorkerSettingsDraft,
  mergeJobs,
  toWorkerSettingsDraft,
  toggleHeavyTypeSelection,
  type WorkerSettingsDraft,
} from './admin-jobs-page.utils';

@Component({
  selector: 'app-admin-jobs-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminJobLogsComponent, ContentHelpComponent, InfoTooltipComponent],
  templateUrl: './admin-jobs.page.html',
  styleUrl: './admin-jobs.page.css',
})
// AdminJobsPage combines live job monitoring with worker-queue settings controls.
export class AdminJobsPage implements OnInit, OnDestroy {
  readonly jobs = signal<AdminJob[]>([]);
  readonly connected = signal(false);
  readonly mode = signal<'stream' | 'poll'>('stream');
  readonly error = signal<string | null>(null);
  readonly selectedJobId = signal<string | null>(null);
  readonly settingsDraft = signal<WorkerSettingsDraft | null>(null);
  readonly savingSettings = signal(false);
  readonly settingsMessage = signal<string | null>(null);
  readonly jobActionInProgress = signal<string | null>(null);
  readonly jobActionMessage = signal<string | null>(null);
  readonly jobsTotal = signal(0);
  readonly jobsLoadingMore = signal(false);
  readonly allJobTypes: WorkerQueueSettings['heavyJobTypes'] = [
    'INGEST',
    'INGEST_MP3_AS_M4B',
    'SANITIZE_MP3_TO_M4B',
    'RESCAN',
    'SYNC_TAGS',
    'WRITE_METADATA',
    'EXTRACT_COVER',
    'REPLACE_COVER',
    'DELETE_BOOK',
    'REPLACE_FILE',
  ];

  private streamHandle?: JobEventStreamHandle;
  private actionMessageTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly admin: AdminService) {}

  ngOnInit(): void {
    this.reloadWorkerSettings();

    this.admin.listJobs(25, 0).subscribe({
      next: (response) => {
        this.jobs.set(response.jobs);
        this.jobsTotal.set(response.total);
      },
      error: () => this.jobs.set([]),
    });

    this.streamHandle = this.admin.startJobsStream({
      onJobs: (jobs) => {
        if (jobs.length === 0) {
          return;
        }

        this.jobs.set(mergeJobs(this.jobs(), jobs));
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
    this.selectedJobId.set(this.selectedJobId() === job.id ? null : job.id);
  }

  clearSelectedJob(): void {
    this.selectedJobId.set(null);
  }

  selectedJob(): AdminJob | null {
    const selectedId = this.selectedJobId();
    if (!selectedId) {
      return null;
    }

    return this.jobs().find((job) => job.id === selectedId) ?? null;
  }

  toggleHeavyType(
    draft: WorkerSettingsDraft,
    type: WorkerQueueSettings['heavyJobTypes'][number],
    checked: boolean,
  ): void {
    this.settingsDraft.set(toggleHeavyTypeSelection(draft, type, checked));
  }

  reloadWorkerSettings(): void {
    this.settingsMessage.set(null);
    this.admin.getWorkerSettings().subscribe({
      next: (settings) => {
        this.settingsDraft.set(toWorkerSettingsDraft(settings));
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
    this.admin.updateWorkerSettings(fromWorkerSettingsDraft(draft)).subscribe({
      next: (saved) => {
        this.savingSettings.set(false);
        this.settingsDraft.set(toWorkerSettingsDraft(saved));
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
    clearTimeout(this.actionMessageTimer);
  }

  loadMoreJobs(): void {
    const currentCount = this.jobs().length;
    if (currentCount >= this.jobsTotal() || this.jobsLoadingMore()) {
      return;
    }

    this.jobsLoadingMore.set(true);
    this.admin.listJobs(25, currentCount).subscribe({
      next: (response) => {
        this.jobs.update((current) => mergeJobs(current, response.jobs));
        this.jobsTotal.set(response.total);
        this.jobsLoadingMore.set(false);
      },
      error: () => {
        this.jobsLoadingMore.set(false);
      },
    });
  }

  rerunJob(job: AdminJob): void {
    // Job rerun would require a backend endpoint to re-enqueue a specific job type
    // with the same parameters. This is a placeholder for future implementation.
    this.jobActionMessage.set('Job rerun requires backend API endpoint implementation');
    clearTimeout(this.actionMessageTimer);
    this.actionMessageTimer = setTimeout(() => this.jobActionMessage.set(null), 3000);
  }

  triggerManualParityScan(): void {
    this.jobActionInProgress.set('parity-scan');
    this.jobActionMessage.set(null);

    this.admin.enqueueAdminJob('RESCAN', { force: true, trigger: 'manual-admin' }).subscribe({
      next: (job) => {
        this.jobActionInProgress.set(null);
        this.jobActionMessage.set(`Manual parity scan queued (${job.id})`);
        clearTimeout(this.actionMessageTimer);
        this.actionMessageTimer = setTimeout(() => this.jobActionMessage.set(null), 3500);
      },
      error: (error: unknown) => {
        this.jobActionInProgress.set(null);
        this.jobActionMessage.set(
          error instanceof Error ? error.message : 'Could not queue parity scan',
        );
        clearTimeout(this.actionMessageTimer);
        this.actionMessageTimer = setTimeout(() => this.jobActionMessage.set(null), 3500);
      },
    });
  }

  triggerSyncTags(): void {
    this.jobActionInProgress.set('sync-tags');
    this.jobActionMessage.set(null);

    this.admin.enqueueAdminJob('SYNC_TAGS', { trigger: 'manual-admin' }).subscribe({
      next: (job) => {
        this.jobActionInProgress.set(null);
        this.jobActionMessage.set(`Tag sync queued (${job.id})`);
        clearTimeout(this.actionMessageTimer);
        this.actionMessageTimer = setTimeout(() => this.jobActionMessage.set(null), 3500);
      },
      error: (error: unknown) => {
        this.jobActionInProgress.set(null);
        this.jobActionMessage.set(
          error instanceof Error ? error.message : 'Could not queue tag sync',
        );
        clearTimeout(this.actionMessageTimer);
        this.actionMessageTimer = setTimeout(() => this.jobActionMessage.set(null), 3500);
      },
    });
  }

  triggerCoverOverrideRemediation(): void {
    this.jobActionInProgress.set('cover-remediation');
    this.jobActionMessage.set(null);

    this.admin.triggerCoverOverrideRemediation().subscribe({
      next: (response) => {
        this.jobActionInProgress.set(null);
        this.jobActionMessage.set(`Cover remediation scan queued (${response.jobId})`);
        clearTimeout(this.actionMessageTimer);
        this.actionMessageTimer = setTimeout(() => this.jobActionMessage.set(null), 3500);
      },
      error: (error: unknown) => {
        this.jobActionInProgress.set(null);
        this.jobActionMessage.set(
          error instanceof Error ? error.message : 'Could not queue cover remediation scan',
        );
        clearTimeout(this.actionMessageTimer);
        this.actionMessageTimer = setTimeout(() => this.jobActionMessage.set(null), 3500);
      },
    });
  }
}
