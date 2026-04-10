import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminService } from '../../../core/services/admin.service';
import type { AdminJob, JobEventStreamHandle, WorkerQueueSettings } from '../../../core/services/admin.types';
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
  readonly jobActionInProgress = signal<string | null>(null);
  readonly jobActionMessage = signal<string | null>(null);
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
    this.selectedJobId.set(job.id);
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
  }

  rerunJob(job: AdminJob): void {
    // Job rerun would require a backend endpoint to re-enqueue a specific job type
    // with the same parameters. This is a placeholder for future implementation.
    this.jobActionMessage.set('Job rerun requires backend API endpoint implementation');
    setTimeout(() => this.jobActionMessage.set(null), 3000);
  }

  triggerManualParityScan(): void {
    // Manual parity scan would require a special POST endpoint in the admin API.
    // This is a placeholder for future implementation.
    this.jobActionMessage.set('Manual parity scan requires backend API endpoint implementation');
    setTimeout(() => this.jobActionMessage.set(null), 3000);
  }
}
