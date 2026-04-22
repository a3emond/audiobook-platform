import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InfoTooltipComponent } from '../info-tooltip/info-tooltip.component';

@Component({
  selector: 'app-field-help',
  standalone: true,
  imports: [CommonModule, InfoTooltipComponent],
  templateUrl: './field-help.component.html',
  styleUrl: './field-help.component.css',
})
export class FieldHelpComponent {
  readonly label = input.required<string>();
  readonly hint = input<string | null>(null);
  readonly tooltip = input<string | null>(null);
}
