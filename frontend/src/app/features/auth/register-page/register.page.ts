import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AppConfigService } from '../../../core/services/config.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { AuthService } from '../../../core/services/auth.service';
import { OAuthButtonsComponent } from '../oauth-buttons/oauth-buttons.js';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, OAuthButtonsComponent, TranslatePipe],
  templateUrl: './register.page.html',
  styleUrl: './register.page.css',
})
// Main UI/state logic for this standalone view component.
export class RegisterPage {
  displayName = '';
  email = '';
  password = '';
  confirm = '';

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly validationError = signal<string | null>(null);
  private readonly inferredLocale: 'fr' | 'en' = navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';

  constructor(
    protected readonly config: AppConfigService,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  async submit(): Promise<void> {
    this.error.set(null);
    this.validationError.set(null);

    if (!this.email || !this.password) {
      this.validationError.set('Email and password are required.');
      return;
    }

    if (this.password.length < 8) {
      this.validationError.set('Password must be at least 8 characters.');
      return;
    }

    if (this.password !== this.confirm) {
      this.validationError.set('Passwords do not match.');
      return;
    }

    this.loading.set(true);
    try {
      await this.auth.register({
        email: this.email,
        password: this.password,
        preferredLocale: this.inferredLocale,
        ...(this.displayName.trim() ? { displayName: this.displayName.trim() } : {}),
      });
      await this.router.navigateByUrl('/library');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  async handleOAuth(event: { provider: 'google' | 'apple'; idToken: string }): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.loginWithOAuth(event.provider, event.idToken);
      await this.router.navigateByUrl('/library');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
