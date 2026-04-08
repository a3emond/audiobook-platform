import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import type { SeriesDetail } from '../../../core/models/api.models';
import { LibraryService } from '../../../core/services/library.service';
import { BookCardComponent } from '../book-card/book-card.component';

@Component({
  selector: 'app-series-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink, BookCardComponent],
  templateUrl: './series-detail-page.component.html',
  styleUrl: './series-detail-page.component.css',
})
export class SeriesDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly library = inject(LibraryService);

  readonly series = signal<SeriesDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const seriesName = this.route.snapshot.paramMap.get('seriesName');
    if (!seriesName) {
      this.error.set('Missing series name');
      return;
    }

    this.loading.set(true);
    this.library.getSeries(seriesName).subscribe({
      next: (series) => {
        this.series.set(series);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Unable to load series details');
        this.loading.set(false);
      },
    });
  }
}
