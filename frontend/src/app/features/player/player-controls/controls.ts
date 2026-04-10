import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
	selector: 'app-player-controls',
	standalone: true,
	templateUrl: './controls.html',
	styleUrl: './controls.css',
})
// Main UI/state logic for this standalone view component.
export class PlayerControlsComponent {
	@Input() paused = true;
	@Input() backwardSeconds = 15;
	@Input() forwardSeconds = 30;
	@Output() toggle = new EventEmitter<void>();
	@Output() seek = new EventEmitter<number>();
}
