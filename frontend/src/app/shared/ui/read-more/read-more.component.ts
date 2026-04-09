import { Component, Input, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-read-more',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="read-more-text">{{ displayText() }}</span>
    @if (isTruncatable()) {
      <button type="button" class="read-more-toggle" (click)="toggle()">
        {{ expanded() ? 'Show less' : 'Read more' }}
      </button>
    }
  `,
  styles: [`
    :host {
      display: block;
    }
    .read-more-text {
      white-space: pre-line;
      word-break: break-word;
    }
    .read-more-toggle {
      display: inline-block;
      margin-top: 0.3rem;
      border: none;
      background: transparent;
      padding: 0;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--color-accent, #ff8a00);
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .read-more-toggle:hover {
      opacity: 0.8;
    }
  `],
})
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
