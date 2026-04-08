import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';

import { AdminCoverage, AdminOverview, AdminService } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-overview-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section>
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
        <table *ngIf="c.adminOnlyEndpoints.length > 0">
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
    </section>
  `,
  styles: [
    `
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.7rem; }
      .card { background: #fff; border: 1px solid #e4e4e7; border-radius: 0.5rem; padding: 0.8rem; }
      .card h3 { margin: 0 0 0.4rem; font-size: 0.95rem; }
      .card p { margin: 0; font-size: 1.3rem; font-weight: 700; }
      .jobs-status { margin: 1rem 0; display: grid; gap: 0.25rem; }
      table { width: 100%; border-collapse: collapse; background: #fff; }
      th, td { border: 1px solid #e4e4e7; padding: 0.45rem; text-align: left; }
      .error { color: #b81f24; }
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
