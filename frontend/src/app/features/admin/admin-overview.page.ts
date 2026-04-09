import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';

import { AdminCoverage, AdminOverview, AdminService } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-overview-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="admin-page">
      <h1>Admin Overview</h1>

      <p *ngIf="loading()">Loading overview...</p>
      <p *ngIf="error()" class="error">{{ error() }}</p>

      <div *ngIf="overview() as o" class="cards">
        <article class="card"><h3>Users</h3><p>{{ o.counts.users }}</p></article>
        <article class="card"><h3>Books</h3><p>{{ o.counts.books }}</p></article>
        <article class="card"><h3>Collections</h3><p>{{ o.counts.collections }}</p></article>
        <article class="card"><h3>Jobs</h3><p>{{ o.counts.jobs }}</p></article>
      </div>

      <div *ngIf="overview() as o" class="jobs-status">
        <h2>Jobs by Status</h2>
        <p>Queued: {{ o.jobsByStatus.queued }}</p>
        <p>Running: {{ o.jobsByStatus.running }}</p>
        <p>Retrying: {{ o.jobsByStatus.retrying }}</p>
        <p>Done: {{ o.jobsByStatus.done }}</p>
        <p>Failed: {{ o.jobsByStatus.failed }}</p>
      </div>

      <section *ngIf="coverage() as c">
        <h2>Admin Coverage</h2>
        <table *ngIf="c.adminOnlyEndpoints.length > 0" class="admin-table">
          <thead>
            <tr><th>Method</th><th>Path</th><th>Area</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr *ngFor="let endpoint of c.adminOnlyEndpoints">
              <td>{{ endpoint.method }}</td>
              <td>{{ endpoint.path }}</td>
              <td>{{ endpoint.area }}</td>
              <td>{{ endpoint.description }}</td>
            </tr>
          </tbody>
        </table>

        <ul *ngIf="c.notes.length > 0">
          <li *ngFor="let note of c.notes">{{ note }}</li>
        </ul>
      </section>
    </div>
  `,
  styles: [
    `
      .admin-page { display: grid; gap: 0.9rem; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.7rem; }
      .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 0.8rem; }
      .card h3 { margin: 0 0 0.4rem; font-size: 0.95rem; }
      .card p { margin: 0; font-size: 1.3rem; font-weight: 700; }
      .jobs-status { margin: 0.2rem 0; display: grid; gap: 0.25rem; padding: 0.8rem; border: 1px solid var(--color-border); border-radius: 0.5rem; background: var(--color-surface); }
      .admin-table { width: 100%; border-collapse: collapse; background: var(--color-surface); }
      .admin-table th, .admin-table td { border: 1px solid var(--color-border); padding: 0.45rem; text-align: left; }
      .admin-table th { background: #1a1a1a; color: var(--color-text-muted); }
      .error { color: var(--color-danger); }
    `,
  ],
})
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
