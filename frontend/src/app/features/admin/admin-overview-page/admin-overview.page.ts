import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';

import { AdminCoverage, AdminOverview, AdminService } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-overview-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-overview.page.html',
  styleUrl: './admin-overview.page.css',
})
// Main UI/state logic for this standalone view component.
export class AdminOverviewPage implements OnInit {
  private readonly admin = inject(AdminService);

  readonly overview = signal<AdminOverview | null>(null);
  readonly coverage = signal<AdminCoverage | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loading.set(true);
    this.error.set(null);

    this.admin.getOverview().subscribe({
      next: (overview) => {
        this.overview.set(overview);

        this.admin.getCoverage().subscribe({
          next: (coverage) => {
            this.coverage.set(coverage);
            this.loading.set(false);
          },
          error: (error: unknown) => {
            this.error.set(error instanceof Error ? error.message : 'Unable to load coverage');
            this.loading.set(false);
          },
        });
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Unable to load overview');
        this.loading.set(false);
      },
    });
  }
}
