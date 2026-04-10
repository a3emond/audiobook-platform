import { Component, Input, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-read-more',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './read-more.component.html',
  styleUrl: './read-more.component.css',
})
// Main UI/state logic for this standalone view component.
export class ReadMoreComponent {
  @Input() text = '';
  @Input() limit = 220;

  readonly expanded = signal(false);

  readonly isTruncatable = computed(() => (this.text?.length ?? 0) > this.limit);

  readonly displayText = computed(() => {
    if (!this.text) {
      return '';
    }
    if (this.expanded() || !this.isTruncatable()) {
      return this.text;
    }
    return this.text.slice(0, this.limit).trimEnd() + '…';
  });

  toggle(): void {
    this.expanded.update((v) => !v);
  }
}
