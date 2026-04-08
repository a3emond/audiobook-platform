import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AppConfigService } from '../../core/services/config.service';
import { AuthService } from '../../core/services/auth.service';
import { OAuthButtonsComponent } from './oauth-buttons';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, OAuthButtonsComponent],
  template: `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-brand">Audiobook Platform</div>
        <h1 class="auth-title">Sign in</h1>

        <app-oauth-buttons
          [googleEnabled]="config.googleEnabled"
          [appleEnabled]="config.appleEnabled"
          [loading]="loading()"
          buttonText="signin_with"
          (oauthLogin)="handleOAuth($event)"
        />

        <div class="divider" *ngIf="config.googleEnabled || config.appleEnabled">
          <span>or continue with email</span>
        </div>

        <form (ngSubmit)="submit()" class="form" novalidate>
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
              autocomplete="current-password"
              placeholder="Your password"
            />
          </label>

          <p *ngIf="error()" class="text-error">{{ error() }}</p>

          <button class="btn submit-btn" type="submit" [disabled]="loading()">
            {{ loading() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <p class="footer-link">
          Don't have an account? <a routerLink="/register">Create one</a>
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
      background: #fff;
      border: 1px solid var(--color-border, #e4e4e7);
      border-radius: var(--radius-lg, 0.75rem);
      padding: 2rem 2.25rem;
      width: 100%;
      max-width: 22rem;
      box-shadow: var(--shadow-lg, 0 4px 12px -1px rgb(0 0 0 / 0.12));
    }

    .auth-brand {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--color-text-muted, #6b7280);
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 1rem;
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
  `],
})
export class LoginPage {
  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor(
    protected readonly config: AppConfigService,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  async submit(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      await this.auth.login({ email: this.email, password: this.password });
      await this.router.navigateByUrl('/library');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Unable to sign in');
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
