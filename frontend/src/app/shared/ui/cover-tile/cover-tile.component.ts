import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-cover-tile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cover-tile.component.html',
  styleUrl: './cover-tile.component.css',
})
export class CoverTileComponent {
  @Input() imageUrl = '';
  @Input() fallback = 'BK';
  @Input() alt = 'Cover';
  @Input() completed = false;

  imageFailed = false;

  onError(): void {
    this.imageFailed = true;
  }
}
