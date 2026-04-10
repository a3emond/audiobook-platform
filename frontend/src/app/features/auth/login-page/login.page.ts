import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AppConfigService } from '../../../core/services/config.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { AuthService } from '../../../core/services/auth.service';
import { OAuthButtonsComponent } from '../oauth-buttons/oauth-buttons';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, OAuthButtonsComponent, TranslatePipe],
  templateUrl: './login.page.html',
  styleUrl: './login.page.css',
})
// Main UI/state logic for this standalone view component.
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
