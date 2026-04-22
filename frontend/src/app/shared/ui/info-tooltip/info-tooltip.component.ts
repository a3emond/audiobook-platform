import { Component, ElementRef, HostListener, computed, effect, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

let nextTooltipId = 0;

@Component({
  selector: 'app-info-tooltip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './info-tooltip.component.html',
  styleUrl: './info-tooltip.component.css',
})
export class InfoTooltipComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly text = input.required<string>();
  readonly icon = input('?');
  readonly ariaLabel = input<string | null>(null);
  readonly placement = input<'top' | 'right' | 'bottom' | 'left'>('top');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly maxWidth = input('18rem');
  readonly disabled = input(false);
  readonly closeOnOutsideClick = input(true);

  readonly open = signal(false);
  readonly resolvedAriaLabel = computed(() => this.ariaLabel() ?? this.text());
  readonly tooltipId = `info-tooltip-${++nextTooltipId}`;

  constructor() {
    effect(() => {
      if (this.disabled()) {
        this.hide();
      }
    });
  }

  show(): void {
    if (this.disabled()) {
      return;
    }
    this.open.set(true);
  }

  hide(): void {
    this.open.set(false);
  }

  toggle(): void {
    if (this.disabled()) {
      return;
    }
    this.open.update((value) => !value);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.hide();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open() || !this.closeOnOutsideClick()) {
      return;
    }

    const target = event.target;
    if (target instanceof Node && this.host.nativeElement.contains(target)) {
      return;
    }

    this.hide();
  }
}
