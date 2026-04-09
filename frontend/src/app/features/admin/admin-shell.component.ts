import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
	selector: 'app-admin-shell',
	standalone: true,
	imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
	template: `
		<!-- Mobile: dark overlay when sidebar is open -->
		<div
			class="admin-nav-overlay"
			[class.visible]="navOpen()"
			(click)="closeNav()"
		></div>

		<div class="admin-shell">
			<!-- ═══════════════════════════════════════════════════
			     SIDEBAR
			═══════════════════════════════════════════════════ -->
			<aside class="admin-sidebar" [class.open]="navOpen()">
				<div class="sidebar-header">
					<div class="sidebar-brand">
						<svg class="sidebar-logo" viewBox="0 0 20 20" fill="none" aria-hidden="true">
							<circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
							<circle cx="10" cy="10" r="5.5" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
							<circle cx="10" cy="10" r="2" fill="currentColor"/>
						</svg>
						<span>Admin</span>
					</div>
					<button
						class="sidebar-close-btn"
						type="button"
						(click)="closeNav()"
						aria-label="Close sidebar"
					>
						<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
						</svg>
					</button>
				</div>

				<nav class="sidebar-nav" role="navigation" aria-label="Admin navigation">
					<!-- Overview -->
					<a
						class="nav-item"
						routerLink="overview"
						routerLinkActive="active"
						(click)="closeNav()"
					>
						<svg class="nav-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.4"/>
							<rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.4"/>
							<rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.4"/>
							<rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.4"/>
						</svg>
						<span>Overview</span>
					</a>

					<!-- CONTENT section -->
					<div class="nav-group-label">Content</div>

					<a
						class="nav-item"
						routerLink="books"
						routerLinkActive="active"
						[routerLinkActiveOptions]="{ exact: false }"
						(click)="closeNav()"
					>
						<svg class="nav-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<rect x="2" y="1" width="9" height="14" rx="1" stroke="currentColor" stroke-width="1.4"/>
							<path d="M11 3h2a1 1 0 011 1v10a1 1 0 01-1 1h-2" stroke="currentColor" stroke-width="1.4"/>
							<path d="M5 5h4M5 8h4M5 11h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
						</svg>
						<span>Books</span>
					</a>

					<a
						class="nav-item"
						routerLink="upload"
						routerLinkActive="active"
						(click)="closeNav()"
					>
						<svg class="nav-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path d="M8 11V3M5 6l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							<path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
						</svg>
						<span>Upload</span>
					</a>

					<!-- PEOPLE section -->
					<div class="nav-group-label">People</div>

					<a
						class="nav-item"
						routerLink="users"
						routerLinkActive="active"
						(click)="closeNav()"
					>
						<svg class="nav-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<circle cx="6" cy="5" r="3" stroke="currentColor" stroke-width="1.4"/>
							<path d="M1 14c0-3 2-5 5-5s5 2 5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
							<circle cx="12" cy="5" r="2" stroke="currentColor" stroke-width="1.2"/>
							<path d="M14 14c0-2-1-3.5-2-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
						</svg>
						<span>Users</span>
					</a>

					<!-- SYSTEM section -->
					<div class="nav-group-label">System</div>

					<a
						class="nav-item"
						routerLink="jobs"
						routerLinkActive="active"
						(click)="closeNav()"
					>
						<svg class="nav-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.4"/>
							<path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
						</svg>
						<span>Jobs &amp; Queue</span>
					</a>
				</nav>

				<div class="sidebar-footer">
					<a class="sidebar-back-link" routerLink="/library" (click)="closeNav()">
						<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path d="M10 12L6 8l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<span>Back to App</span>
					</a>
				</div>
			</aside>

			<!-- ═══════════════════════════════════════════════════
			     CONTENT
			═══════════════════════════════════════════════════ -->
			<div class="admin-body">
				<!-- Mobile top bar (visible only on narrow screens) -->
				<header class="admin-mobile-bar">
					<button
						class="menu-toggle-btn"
						type="button"
						(click)="openNav()"
						aria-label="Open admin menu"
					>
						<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
							<path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
						</svg>
					</button>
					<span class="admin-mobile-title">Admin Dashboard</span>
					<a class="admin-mobile-app-link" routerLink="/library">
						<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path d="M10 12L6 8l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						App
					</a>
				</header>

				<main class="admin-main">
					<router-outlet />
				</main>
			</div>
		</div>
	`,
	styles: [
		`
		/* ── Host ─────────────────────────────────────────────────── */
		:host {
			display: flex;
			flex: 1;
			min-height: 0;
			overflow: hidden;
		}

		/* ── Overlay (mobile only) ────────────────────────────────── */
		.admin-nav-overlay {
			display: none;
		}

		/* ── Shell wrapper ─────────────────────────────────────────── */
		.admin-shell {
			display: flex;
			flex: 1;
			min-height: 0;
			overflow: hidden;
			background: var(--color-bg);
		}

		/* ══════════════════════════════════════════════════════════
		   SIDEBAR
		══════════════════════════════════════════════════════════ */
		.admin-sidebar {
			width: 220px;
			flex-shrink: 0;
			display: flex;
			flex-direction: column;
			background: #0d0d0d;
			border-right: 1px solid var(--color-border);
			overflow-y: auto;
			overflow-x: hidden;
			scrollbar-width: thin;
			scrollbar-color: #242424 transparent;
			z-index: 50;
		}
		.admin-sidebar::-webkit-scrollbar { width: 3px; }
		.admin-sidebar::-webkit-scrollbar-track { background: transparent; }
		.admin-sidebar::-webkit-scrollbar-thumb { background: #222; border-radius: 99px; }

		/* Header */
		.sidebar-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 1rem 0.875rem 0.875rem;
			border-bottom: 1px solid var(--color-border);
			flex-shrink: 0;
		}

		.sidebar-brand {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			font-family: "Space Grotesk", "Outfit", sans-serif;
			font-weight: 700;
			font-size: 0.95rem;
			color: var(--color-text);
			letter-spacing: -0.01em;
		}

		.sidebar-logo {
			width: 1.1rem;
			height: 1.1rem;
			color: var(--color-primary, #ff8c00);
			flex-shrink: 0;
		}

		.sidebar-close-btn {
			display: none;
			background: none;
			border: none;
			color: var(--color-text-muted);
			cursor: pointer;
			padding: 0.25rem;
			border-radius: var(--radius-sm, 0.25rem);
			transition: color 0.12s, background 0.12s;
		}
		.sidebar-close-btn svg {
			width: 1rem;
			height: 1rem;
			display: block;
		}
		.sidebar-close-btn:hover {
			color: var(--color-text);
			background: rgb(255 255 255 / 0.06);
		}

		/* Nav */
		.sidebar-nav {
			flex: 1;
			padding: 0.6rem 0.4rem;
			display: flex;
			flex-direction: column;
			gap: 0.05rem;
		}

		.nav-group-label {
			font-size: 0.67rem;
			text-transform: uppercase;
			letter-spacing: 0.1em;
			color: var(--color-text-muted);
			padding: 0.8rem 0.6rem 0.2rem;
			font-weight: 600;
			opacity: 0.7;
		}

		.nav-item {
			display: flex;
			align-items: center;
			gap: 0.6rem;
			padding: 0.5rem 0.65rem;
			border-radius: var(--radius-sm, 0.25rem);
			color: var(--color-text-muted);
			font-size: 0.875rem;
			font-weight: 450;
			text-decoration: none;
			transition: background 0.12s, color 0.12s;
			position: relative;
		}

		.nav-item:hover {
			background: rgb(255 138 0 / 0.08);
			color: var(--color-text);
			text-decoration: none;
		}

		.nav-item.active {
			background: rgb(255 138 0 / 0.14);
			color: var(--color-primary, #ff8c00);
			font-weight: 600;
		}
		.nav-item.active::before {
			content: '';
			position: absolute;
			left: 0;
			top: 20%;
			bottom: 20%;
			width: 2px;
			background: var(--color-primary, #ff8c00);
			border-radius: 0 2px 2px 0;
		}

		.nav-icon {
			width: 1rem;
			height: 1rem;
			flex-shrink: 0;
			display: block;
			color: inherit;
		}

		/* Footer */
		.sidebar-footer {
			padding: 0.75rem 0.875rem;
			border-top: 1px solid var(--color-border);
			flex-shrink: 0;
		}

		.sidebar-back-link {
			display: flex;
			align-items: center;
			gap: 0.35rem;
			font-size: 0.82rem;
			color: var(--color-text-muted);
			text-decoration: none;
			transition: color 0.12s;
		}
		.sidebar-back-link svg {
			width: 0.9rem;
			height: 0.9rem;
			flex-shrink: 0;
		}
		.sidebar-back-link:hover {
			color: var(--color-text);
			text-decoration: none;
		}

		/* ══════════════════════════════════════════════════════════
		   CONTENT BODY
		══════════════════════════════════════════════════════════ */
		.admin-body {
			flex: 1;
			min-width: 0;
			display: flex;
			flex-direction: column;
			overflow: hidden;
		}

		/* Mobile topbar — hidden on desktop */
		.admin-mobile-bar {
			display: none;
			align-items: center;
			gap: 0.75rem;
			padding: 0 1rem;
			height: 2.75rem;
			background: #0d0d0d;
			border-bottom: 1px solid var(--color-border);
			flex-shrink: 0;
		}

		.menu-toggle-btn {
			background: none;
			border: none;
			color: var(--color-text);
			cursor: pointer;
			padding: 0.2rem;
			border-radius: var(--radius-sm, 0.25rem);
		}
		.menu-toggle-btn svg {
			width: 1.2rem;
			height: 1.2rem;
			display: block;
		}

		.admin-mobile-title {
			flex: 1;
			font-weight: 600;
			font-size: 0.875rem;
		}

		.admin-mobile-app-link {
			display: flex;
			align-items: center;
			gap: 0.2rem;
			font-size: 0.8rem;
			color: var(--color-text-muted);
			text-decoration: none;
		}
		.admin-mobile-app-link svg {
			width: 0.85rem;
			height: 0.85rem;
		}
		.admin-mobile-app-link:hover {
			color: var(--color-text);
			text-decoration: none;
		}

		/* Main content */
		.admin-main {
			flex: 1;
			overflow-y: auto;
			overflow-x: hidden;
			padding: 1.75rem 2.25rem;
			scrollbar-width: thin;
			scrollbar-color: #2e2e2e transparent;
		}
		.admin-main::-webkit-scrollbar { width: 5px; }
		.admin-main::-webkit-scrollbar-track { background: transparent; }
		.admin-main::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 99px; }
		.admin-main::-webkit-scrollbar-thumb:hover { background: #3a3a3a; }

		/* ══════════════════════════════════════════════════════════
		   RESPONSIVE
		══════════════════════════════════════════════════════════ */

		/* Tablet / narrow desktop — still show sidebar but narrower */
		@media (max-width: 1100px) {
			.admin-sidebar { width: 200px; }
			.admin-main { padding: 1.5rem 1.75rem; }
		}

		/* Mobile — sidebar becomes a slide-in drawer */
		@media (max-width: 860px) {
			.admin-nav-overlay {
				display: block;
				position: fixed;
				inset: 0;
				background: rgb(0 0 0 / 0.55);
				z-index: 40;
				opacity: 0;
				pointer-events: none;
				transition: opacity 0.22s ease;
			}
			.admin-nav-overlay.visible {
				opacity: 1;
				pointer-events: all;
			}

			.admin-sidebar {
				position: fixed;
				top: 0;
				left: 0;
				bottom: 0;
				width: 260px;
				transform: translateX(-100%);
				transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
				border-right: none;
				box-shadow: none;
			}
			.admin-sidebar.open {
				transform: translateX(0);
				box-shadow: 6px 0 30px rgb(0 0 0 / 0.55);
			}

			.sidebar-close-btn { display: block; }
			.admin-mobile-bar  { display: flex; }
			.admin-main { padding: 1rem 1.25rem; }
		}

		@media (max-width: 480px) {
			.admin-main { padding: 0.85rem; }
		}
		`,
	],
})
export class AdminShellComponent {
	readonly navOpen = signal(false);

	openNav(): void {
		this.navOpen.set(true);
	}

	closeNav(): void {
		this.navOpen.set(false);
	}
}
