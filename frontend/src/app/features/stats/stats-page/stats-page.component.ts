import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';

import { I18nService } from '../../../core/services/i18n.service';
import { StatsService, UserStatsResponse } from '../../../core/services/stats.service';

@Component({
  selector: 'app-stats-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stats-page.component.html',
  styleUrl: './stats-page.component.css',
})
// stats-page: keeps UI and state logic readable for this frontend unit.
export class StatsPageComponent implements OnInit {
  readonly stats = signal<UserStatsResponse | null>(null);
  private readonly statsService = inject(StatsService);
  protected readonly i18n = inject(I18nService);

  ngOnInit(): void {
    this.statsService.getMine().subscribe({
      next: (response) => this.stats.set(response),
      error: () => this.stats.set(null),
    });
  }

  formatDuration(valueSeconds: number): string {
    const total = Math.max(0, Math.floor(valueSeconds || 0));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    return `${String(days).padStart(2, '0')}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }
}
