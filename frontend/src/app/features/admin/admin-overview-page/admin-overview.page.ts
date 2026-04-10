import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';

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
  readonly coverageByArea = computed(() => {
    const coverage = this.coverage();
    if (!coverage) {
      return [] as Array<{ area: string; endpoints: AdminCoverage['adminOnlyEndpoints'] }>;
    }

    const groups = new Map<string, AdminCoverage['adminOnlyEndpoints']>();
    for (const endpoint of coverage.adminOnlyEndpoints) {
      const existing = groups.get(endpoint.area) ?? [];
      existing.push(endpoint);
      groups.set(endpoint.area, existing);
    }

    return Array.from(groups.entries())
      .map(([area, endpoints]) => ({
        area,
        endpoints: endpoints.slice().sort((a, b) => a.path.localeCompare(b.path)),
      }))
      .sort((a, b) => a.area.localeCompare(b.area));
  });
  readonly totalAdminEndpoints = computed(() => this.coverage()?.adminOnlyEndpoints.length ?? 0);

  ngOnInit(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      overview: this.admin.getOverview(),
      coverage: this.admin.getCoverage(),
    }).subscribe({
      next: ({ overview, coverage }) => {
        this.overview.set(overview);
        this.coverage.set(coverage);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Unable to load admin overview data');
        this.loading.set(false);
      },
    });
  }

  areaLabel(area: string): string {
    switch (area) {
      case 'books':
        return 'Books';
      case 'jobs':
        return 'Jobs';
      case 'platform':
        return 'Platform';
      case 'users':
        return 'Users';
      default:
        return area;
    }
  }
}
