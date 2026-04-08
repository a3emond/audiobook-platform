import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { I18nService } from '../../core/services/i18n.service';
import { SettingsService } from '../../core/services/settings.service';

interface ThresholdOption {
	label: string;
	seconds: number;
}

@Component({
	selector: 'app-settings-page',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<section class="page-shell">
			<h1 class="hero-title">Settings</h1>
			<p class="hero-subtitle">Profile and player behavior preferences.</p>

			<p *ngIf="loading()" class="text-muted">Loading settings...</p>
			<p *ngIf="error()" class="text-error">{{ error() }}</p>
			<p *ngIf="success()" class="text-success">{{ success() }}</p>

			<form *ngIf="!loading()" (ngSubmit)="saveAll()" class="grid card">
				<h2>Profile</h2>
				<label>
					Display Name
					<input name="displayName" [(ngModel)]="displayName" />
				</label>

				<label>
					Preferred Locale
					<select name="preferredLocale" [(ngModel)]="preferredLocale">
						<option value="en">English</option>
						<option value="fr">Francais</option>
					</select>
				</label>

				<h2>Player</h2>
				<label>
					Forward Jump
					<select name="forwardJumpSeconds" [(ngModel)]="forwardJumpSeconds">
						<option *ngFor="let value of jumpOptions" [ngValue]="value">{{ value }} seconds</option>
					</select>
				</label>

				<label>
					Backward Jump
					<select name="backwardJumpSeconds" [(ngModel)]="backwardJumpSeconds">
						<option *ngFor="let value of jumpOptions" [ngValue]="value">{{ value }} seconds</option>
					</select>
				</label>

				<label>
					Playback Rate
					<input name="rate" type="number" step="0.05" min="0.5" max="3" [(ngModel)]="playbackRate" />
				</label>

				<label class="checkbox-row">
					<input name="rewindEnabled" type="checkbox" [(ngModel)]="resumeRewindEnabled" />
					<span>Resume Rewind Enabled</span>
				</label>

				<label>
					Resume Rewind Threshold
					<select name="rewindThresholdSeconds" [(ngModel)]="rewindThresholdSeconds">
						<option *ngFor="let option of thresholdOptions" [ngValue]="option.seconds">{{ option.label }}</option>
					</select>
				</label>

				<label>
					Resume Rewind Amount
					<select name="rewindSeconds" [(ngModel)]="rewindSeconds">
						<option *ngFor="let value of jumpOptions" [ngValue]="value">{{ value }} seconds</option>
					</select>
				</label>

				<h2>Library</h2>
				<label class="checkbox-row">
					<input name="showCompleted" type="checkbox" [(ngModel)]="showCompleted" />
					<span>Show completed books in library</span>
				</label>

				<button class="btn" type="submit" [disabled]="saving()">
					{{ saving() ? 'Saving...' : 'Save Settings' }}
				</button>
			</form>
		</section>
	`,
	styles: [
		`
			.grid { display: grid; gap: 0.7rem; max-width: 42rem; margin-top: 0.9rem; }
			label { display: grid; gap: 0.3rem; }
			.checkbox-row {
				display: flex;
				align-items: center;
				gap: 0.5rem;
			}
			.checkbox-row input {
				width: auto;
			}
		`,
	],
})
export class SettingsPage implements OnInit {
	private readonly settingsService = inject(SettingsService);
	private readonly i18n = inject(I18nService);

	readonly loading = signal(true);
	readonly saving = signal(false);
	readonly error = signal<string | null>(null);
	readonly success = signal<string | null>(null);

	readonly jumpOptions = [5, 10, 15, 20, 25, 30];
	readonly thresholdOptions: ThresholdOption[] = [
		{ label: '30 minutes', seconds: 30 * 60 },
		{ label: '1 hour', seconds: 60 * 60 },
		{ label: '2 hours', seconds: 2 * 60 * 60 },
		{ label: '4 hours', seconds: 4 * 60 * 60 },
		{ label: '8 hours', seconds: 8 * 60 * 60 },
		{ label: '12 hours', seconds: 12 * 60 * 60 },
		{ label: '24 hours', seconds: 24 * 60 * 60 },
		{ label: '48 hours', seconds: 48 * 60 * 60 },
		{ label: '72 hours', seconds: 72 * 60 * 60 },
		{ label: '1 week', seconds: 7 * 24 * 60 * 60 },
	];

	displayName = '';
	preferredLocale: 'fr' | 'en' = 'en';
	forwardJumpSeconds = 30;
	backwardJumpSeconds = 10;
	playbackRate = 1;
	resumeRewindEnabled = true;
	rewindThresholdSeconds = 24 * 60 * 60;
	rewindSeconds = 30;
	showCompleted = true;

	ngOnInit(): void {
		this.loadData();
	}

	saveAll(): void {
		this.saving.set(true);
		this.error.set(null);
		this.success.set(null);

		this.settingsService
			.updateMyProfile({
				profile: {
					displayName: this.displayName.trim() || null,
					preferredLocale: this.preferredLocale,
				},
			})
			.subscribe({
				next: () => {
					this.settingsService
						.updateMine({
							locale: this.preferredLocale,
							player: {
								forwardJumpSeconds: this.forwardJumpSeconds,
								backwardJumpSeconds: this.backwardJumpSeconds,
								playbackRate: this.playbackRate,
								resumeRewind: {
									enabled: this.resumeRewindEnabled,
									thresholdSinceLastListenSeconds: this.rewindThresholdSeconds,
									rewindSeconds: this.rewindSeconds,
								},
							},
							library: {
								showCompleted: this.showCompleted,
							},
						})
						.subscribe({
							next: () => {
								this.i18n.setLocale(this.preferredLocale);
								this.success.set('Settings saved');
								this.saving.set(false);
							},
							error: (error: unknown) => {
								this.error.set(error instanceof Error ? error.message : 'Failed to save settings');
								this.saving.set(false);
							},
						});
				},
				error: (error: unknown) => {
					this.error.set(error instanceof Error ? error.message : 'Failed to save profile');
					this.saving.set(false);
				},
			});
	}

	private loadData(): void {
		this.loading.set(true);
		this.error.set(null);

		this.settingsService.getMyProfile().subscribe({
			next: (profile) => {
				this.displayName = profile.profile.displayName ?? '';
				this.preferredLocale = profile.profile.preferredLocale;

				this.settingsService.getMine().subscribe({
					next: (settings) => {
						this.forwardJumpSeconds = this.closestOption(settings.player.forwardJumpSeconds, this.jumpOptions);
						this.backwardJumpSeconds = this.closestOption(settings.player.backwardJumpSeconds, this.jumpOptions);
						this.playbackRate = settings.player.playbackRate;
						this.resumeRewindEnabled = settings.player.resumeRewind.enabled;
						this.rewindThresholdSeconds = this.closestThreshold(
							settings.player.resumeRewind.thresholdSinceLastListenSeconds,
						);
						this.rewindSeconds = this.closestOption(settings.player.resumeRewind.rewindSeconds, this.jumpOptions);
						this.showCompleted = settings.library?.showCompleted ?? true;
						this.loading.set(false);
					},
					error: (error: unknown) => {
						this.error.set(error instanceof Error ? error.message : 'Unable to load settings');
						this.loading.set(false);
					},
				});
			},
			error: (error: unknown) => {
				this.error.set(error instanceof Error ? error.message : 'Unable to load profile');
				this.loading.set(false);
			},
		});
	}

	private closestOption(value: number, options: number[]): number {
		return options.reduce((best, current) => {
			return Math.abs(current - value) < Math.abs(best - value) ? current : best;
		}, options[0]);
	}

	private closestThreshold(value: number): number {
		const thresholds = this.thresholdOptions.map((option) => option.seconds);
		return this.closestOption(value, thresholds);
	}
}
