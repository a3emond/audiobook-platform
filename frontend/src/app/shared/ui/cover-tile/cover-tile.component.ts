import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-cover-tile',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './cover-tile.component.html',
  styleUrl: './cover-tile.component.css',
})
// cover-tile: keeps UI and state logic readable for this frontend unit.
export class CoverTileComponent {
  @Input() imageUrl = '';
  @Input() fallback = 'BK';
  @Input() alt = 'Cover';
  @Input() aspectRatio = '1 / 1';
  @Input() completed = false;
  @Input() progressPercent: number | null = null;

  imageFailed = false;

  showProgressOverlay(): boolean {
    return !this.completed && typeof this.progressPercent === 'number' && this.progressPercent > 0;
  }

  normalizedProgressPercent(): number {
    if (!this.showProgressOverlay()) {
      return 0;
    }

    return Math.min(99, Math.max(1, Math.round(this.progressPercent ?? 0)));
  }

  onError(): void {
    this.imageFailed = true;
  }
}
