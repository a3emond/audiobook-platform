import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
	selector: 'app-admin-shell',
	standalone: true,
	imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
	templateUrl: './admin-shell.component.html',
	styleUrl: './admin-shell.component.css',
})
// Main UI/state logic for this standalone view component.
export class AdminShellComponent {
	readonly navOpen = signal(false);

	openNav(): void {
		this.navOpen.set(true);
	}

	closeNav(): void {
		this.navOpen.set(false);
	}
}
