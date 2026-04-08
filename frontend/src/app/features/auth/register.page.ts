import { CommonModule } from '@angular/common';
import { Component, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AppConfigService } from '../../core/services/config.service';
import { AuthService } from '../../core/services/auth.service';
import { OAuthButtonsComponent } from './oauth-buttons.js';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, OAuthButtonsComponent],
  template: `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-brand">
          <img src="/logo_small.png" alt="StoryWave logo" class="auth-logo" />
          <span>StoryWave</span>
        </div>
        <h1 class="auth-title">Create account</h1>

        <app-oauth-buttons
          [googleEnabled]="config.googleEnabled"
          [appleEnabled]="config.appleEnabled"
          [loading]="loading()"
          (oauthLogin)="handleOAuth($event)"
        />

        <div class="divider" *ngIf="config.googleEnabled || config.appleEnabled">
          <span>or continue with email</span>
        </div>

        <form (ngSubmit)="submit()" class="form" novalidate>
          <label>
            Display name <span class="opt">(optional)</span>
            <input
              name="displayName"
              [(ngModel)]="displayName"
              type="text"
              autocomplete="name"
              placeholder="Your name"
            />
          </label>

          <label>
            Email
            <input
              name="email"
              [(ngModel)]="email"
              type="email"
              required
              autocomplete="email"
              placeholder="you@example.com"
            />
          </label>

          <label>
            Password
            <input
              name="password"
              [(ngModel)]="password"
              type="password"
              required
              autocomplete="new-password"
              placeholder="Min 8 characters"
            />
          </label>

          <label>
            Confirm password
            <input
              name="confirm"
              [(ngModel)]="confirm"
              type="password"
              required
              autocomplete="new-password"
              placeholder="Repeat password"
            />
          </label>

          <p *ngIf="validationError()" class="text-error">{{ validationError() }}</p>
          <p *ngIf="error()" class="text-error">{{ error() }}</p>

          <button class="btn submit-btn" type="submit" [disabled]="loading()">
            {{ loading() ? 'Creating account…' : 'Create account' }}
          </button>
        </form>

        <p class="footer-link">
          Already have an account? <a routerLink="/login">Sign in</a>
        </p>

        <p class="legal-link">
          By continuing, you agree to our
          <a routerLink="/terms">Terms</a>
          and
          <a routerLink="/privacy">Privacy Policy</a>.
        </p>
      </div>
    </div>
  `,
  styles: [`
    .auth-shell {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: var(--color-bg, #f7f8fa);
    }

    .auth-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border, #e4e4e7);
      border-radius: var(--radius-lg, 0.75rem);
      padding: 2rem 2.25rem;
      width: 100%;
      max-width: 22rem;
      box-shadow: var(--shadow-lg, 0 4px 12px -1px rgb(0 0 0 / 0.12));
    }

    .auth-brand {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--color-text-muted, #b8ae97);
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 1rem;
    }

    .auth-logo {
      width: 1.28rem;
      height: 1.28rem;
      object-fit: cover;
      border-radius: 0.3rem;
      box-shadow: 0 2px 8px rgb(0 0 0 / 0.35);
    }

    .auth-title {
      font-size: 1.4rem;
      font-weight: 700;
      margin-bottom: 1.5rem;
      color: var(--color-text, #1f2937);
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .opt {
      font-weight: 400;
      color: var(--color-text-muted, #6b7280);
      font-size: 0.8rem;
    }

    .submit-btn {
      margin-top: 0.25rem;
      width: 100%;
      justify-content: center;
    }

    .divider {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 1.25rem 0;
      color: var(--color-text-muted, #6b7280);
      font-size: 0.8rem;
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--color-border, #e4e4e7);
    }

    .footer-link {
      margin-top: 1.25rem;
      text-align: center;
      font-size: 0.85rem;
      color: var(--color-text-muted, #6b7280);
    }

    .legal-link {
      margin-top: 0.65rem;
      text-align: center;
      font-size: 0.75rem;
      color: var(--color-text-muted, #6b7280);
      line-height: 1.45;
    }

    .legal-link a {
      color: var(--color-accent, #2563eb);
      text-decoration: none;
      font-weight: 600;
    }

    .legal-link a:hover {
      text-decoration: underline;
    }
  `],
})
export class RegisterPage implements OnDestroy {
  displayName = '';
  email = '';
  password = '';
  confirm = '';

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly validationError = signal<string | null>(null);

  constructor(
    protected readonly config: AppConfigService,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  ngOnDestroy(): void {}

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
