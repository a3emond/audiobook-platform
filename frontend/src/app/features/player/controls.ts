import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
	selector: 'app-player-controls',
	standalone: true,
	template: `
		<div class="controls" role="group" aria-label="Player transport controls">
			<button type="button" class="circle seek" (click)="seek.emit(-15)" aria-label="Back 15 seconds" title="Back 15s">
				<span class="icon">&#8634;</span>
				<span class="delta">-15</span>
			</button>
			<button type="button" class="circle play" (click)="toggle.emit()" [attr.aria-label]="paused ? 'Play' : 'Pause'">
				<span class="icon" [hidden]="!paused">&#9654;</span>
				<span class="icon" [hidden]="paused">&#10074;&#10074;</span>
			</button>
			<button type="button" class="circle seek" (click)="seek.emit(30)" aria-label="Forward 30 seconds" title="Forward 30s">
				<span class="icon">&#8635;</span>
				<span class="delta">+30</span>
			</button>
		</div>
	`,
	styles: [
		`
			.controls {
				display: flex;
				gap: 0.55rem;
				justify-content: center;
				align-items: center;
				flex-wrap: nowrap;
			}

			.circle {
				width: 2.5rem;
				height: 2.5rem;
				border-radius: 999px;
				border: 1px solid #3a3a3a;
				background: #171717;
				color: var(--color-text);
				display: inline-grid;
				place-items: center;
				position: relative;
				cursor: pointer;
				transition: transform 120ms ease, box-shadow 120ms ease;
			}

			.circle:hover {
				transform: translateY(-1px);
				box-shadow: 0 6px 14px rgb(15 23 42 / 0.14);
			}

			.circle:active {
				transform: translateY(0);
				box-shadow: none;
			}

			.icon {
				font-size: 1rem;
				line-height: 1;
			}

			.play {
				width: 2.85rem;
				height: 2.85rem;
				background: linear-gradient(135deg, #ff9f2f, #ff8500);
				border-color: transparent;
				color: #191919;
			}

			.seek {
				color: var(--color-text);
			}

			.delta {
				position: absolute;
				bottom: -0.22rem;
				padding: 0 0.2rem;
				border-radius: 0.35rem;
				font-size: 0.55rem;
				font-weight: 700;
				background: #111111;
				color: var(--color-text-muted);
				border: 1px solid #3a3a3a;
			}

			@media (max-width: 560px) {
				.controls {
					gap: 0.45rem;
				}

				.circle {
					width: 2.4rem;
					height: 2.4rem;
				}

				.play {
					width: 2.75rem;
					height: 2.75rem;
				}
			}
		`,
	],
})
export class PlayerControlsComponent {
	@Input() paused = true;
	@Output() toggle = new EventEmitter<void>();
	@Output() seek = new EventEmitter<number>();
}
