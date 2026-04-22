import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  effect,
  input,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { InfoTooltipComponent } from '../info-tooltip/info-tooltip.component';

type AnchorPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'right-center'
  | 'bottom-right'
  | 'bottom-center'
  | 'bottom-left'
  | 'left-center';

type TooltipPlacement = 'auto' | 'top' | 'right' | 'bottom' | 'left';
type ResolvedPlacement = 'top' | 'right' | 'bottom' | 'left';

@Component({
  selector: 'app-content-help',
  standalone: true,
  imports: [CommonModule, InfoTooltipComponent],
  templateUrl: './content-help.component.html',
  styleUrl: './content-help.component.css',
})
export class ContentHelpComponent implements AfterViewInit {
  readonly tooltip = input.required<string>();
  readonly ariaLabel = input<string | null>(null);
  readonly anchor = input<AnchorPosition>('top-right');
  readonly tooltipPlacement = input<TooltipPlacement>('auto');
  readonly size = input<'sm' | 'md' | 'lg'>('sm');
  readonly maxWidth = input('18rem');
  readonly offset = input('0.3rem');
  readonly viewportPadding = input(12);
  readonly inline = input(false);
  readonly disabled = input(false);
  readonly closeOnOutsideClick = input(true);

  readonly resolvedPlacement = signal<ResolvedPlacement>('top');

  @ViewChild('anchorNode')
  private anchorNode?: ElementRef<HTMLElement>;

  constructor() {
    effect(() => {
      this.anchor();
      this.tooltipPlacement();
      this.maxWidth();
      this.viewportPadding();
      queueMicrotask(() => this.updatePlacement());
    });
  }

  ngAfterViewInit(): void {
    this.updatePlacement();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updatePlacement();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.updatePlacement();
  }

  private updatePlacement(): void {
    if (typeof window === 'undefined') {
      this.resolvedPlacement.set(this.preferredPlacementFromAnchor(this.anchor()));
      return;
    }

    const configuredPlacement = this.tooltipPlacement();
    if (configuredPlacement !== 'auto') {
      this.resolvedPlacement.set(configuredPlacement);
      return;
    }

    const hostRect = this.anchorNode?.nativeElement.getBoundingClientRect();
    if (!hostRect) {
      this.resolvedPlacement.set(this.preferredPlacementFromAnchor(this.anchor()));
      return;
    }

    const spaces = {
      top: hostRect.top - this.viewportPadding(),
      right: window.innerWidth - hostRect.right - this.viewportPadding(),
      bottom: window.innerHeight - hostRect.bottom - this.viewportPadding(),
      left: hostRect.left - this.viewportPadding(),
    };

    const estimatedWidth = this.estimateTooltipWidthPx();
    const estimatedHeight = this.estimateTooltipHeightPx();
    const requiredByPlacement: Record<ResolvedPlacement, number> = {
      top: estimatedHeight,
      right: estimatedWidth,
      bottom: estimatedHeight,
      left: estimatedWidth,
    };

    let bestPlacement: ResolvedPlacement = this.preferredPlacementFromAnchor(this.anchor());
    let bestScore = spaces[bestPlacement] - requiredByPlacement[bestPlacement];

    (['top', 'right', 'bottom', 'left'] as const).forEach((placement) => {
      const score = spaces[placement] - requiredByPlacement[placement];
      if (score > bestScore) {
        bestPlacement = placement;
        bestScore = score;
      }
    });

    this.resolvedPlacement.set(bestPlacement);
  }

  private preferredPlacementFromAnchor(anchor: AnchorPosition): ResolvedPlacement {
    if (anchor.startsWith('top')) {
      return 'top';
    }
    if (anchor.startsWith('bottom')) {
      return 'bottom';
    }
    if (anchor.startsWith('left')) {
      return 'left';
    }
    return 'right';
  }

  private estimateTooltipWidthPx(): number {
    return this.parseCssSizeToPx(this.maxWidth(), 288);
  }

  private estimateTooltipHeightPx(): number {
    return 84;
  }

  private parseCssSizeToPx(value: string, fallback: number): number {
    if (typeof document === 'undefined') {
      return fallback;
    }

    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return fallback;
    }

    if (trimmed.endsWith('px')) {
      const parsed = Number.parseFloat(trimmed);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    if (trimmed.endsWith('rem')) {
      const parsed = Number.parseFloat(trimmed);
      if (!Number.isFinite(parsed)) {
        return fallback;
      }
      const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize || '16');
      return parsed * (Number.isFinite(rootSize) ? rootSize : 16);
    }

    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
