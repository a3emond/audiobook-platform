import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import type { SeriesDetail } from '../../../core/models/api.models';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { I18nService } from '../../../core/services/i18n.service';
import { LibraryService } from '../../../core/services/library.service';
import { BookCardComponent } from '../book-card/book-card.component';

@Component({
  selector: 'app-series-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink, BookCardComponent, TranslatePipe],
  templateUrl: './series-detail-page.component.html',
  styleUrl: './series-detail-page.component.css',
})
export class SeriesDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly library = inject(LibraryService);
  protected readonly i18n = inject(I18nService);

  readonly series = signal<SeriesDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const seriesName = this.route.snapshot.paramMap.get('seriesName');
    if (!seriesName) {
      this.error.set(this.i18n.t('series.error.missingName', 'Missing series name'));
      return;
    }

    this.loading.set(true);
    this.library.getSeries(seriesName).subscribe({
      next: (series) => {
        this.series.set(series);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : this.i18n.t('series.error.load', 'Unable to load series details'));
        this.loading.set(false);
      },
    });
  }
}
