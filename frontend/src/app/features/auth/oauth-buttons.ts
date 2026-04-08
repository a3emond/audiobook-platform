import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

// ── Google Identity Services SDK typings (loaded at runtime from CDN) ──────────
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              width?: number;
              text?: 'signin_with' | 'signup_with' | 'continue_with';
            },
          ): void;
          disableAutoSelect(): void;
        };
      };
    };
    AppleID?: {
      auth: {
        init(config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          usePopup: boolean;
        }): void;
        signIn(): Promise<{ authorization: { id_token: string } }>;
      };
    };
  }
}

@Component({
  selector: 'app-oauth-buttons',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="oauth-buttons" *ngIf="googleEnabled || appleEnabled">
      <!-- Google renders its own button here -->
      <div #googleBtn class="google-btn-wrapper" *ngIf="googleEnabled"></div>

      <button
        *ngIf="appleEnabled"
        type="button"
        class="oauth-btn apple-btn"
        [disabled]="loading"
        (click)="signInWithApple()"
      >
        <svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
        </svg>
        Continue with Apple
      </button>
    </div>
  `,
  styles: [`
    .oauth-buttons {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      margin-bottom: 0.5rem;
    }

    .google-btn-wrapper {
      /* GIS SDK renders an iframe/button here — let it size naturally */
      display: flex;
      justify-content: center;
    }

    .oauth-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      width: 100%;
      padding: 0.6rem 1rem;
      border: 1px solid #d1d5db;
      border-radius: 0.4rem;
      background: #000;
      color: #fff;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }
    .oauth-btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .apple-btn:hover:not(:disabled) { background: #1a1a1a; }

    .icon { width: 1.15rem; height: 1.15rem; flex-shrink: 0; }
  `],
})
export class OAuthButtonsComponent implements AfterViewInit, OnDestroy {
  @Input() googleEnabled = false;
  @Input() appleEnabled = false;
  @Input() loading = false;
  @Input() buttonText: 'signin_with' | 'signup_with' | 'continue_with' = 'continue_with';

  @Output() oauthLogin = new EventEmitter<{ provider: 'google' | 'apple'; idToken: string }>();

  @ViewChild('googleBtn') googleBtnRef?: ElementRef<HTMLDivElement>;

  private googleScriptEl?: HTMLScriptElement;
  private appleScriptEl?: HTMLScriptElement;

  constructor(private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    if (this.googleEnabled) {
      this.loadGoogleGIS();
    }
    if (this.appleEnabled) {
      this.loadAppleJS();
    }
  }

  ngOnDestroy(): void {
    window.google?.accounts.id.disableAutoSelect();
  }

  // ── Google ──────────────────────────────────────────────────────────────────
  private loadGoogleGIS(): void {
    if (window.google?.accounts) {
      this.initGoogle();
      return;
    }

    this.googleScriptEl = document.createElement('script');
    this.googleScriptEl.src = 'https://accounts.google.com/gsi/client';
    this.googleScriptEl.async = true;
    this.googleScriptEl.onload = () => this.zone.run(() => this.initGoogle());
    document.head.appendChild(this.googleScriptEl);
  }

  private initGoogle(): void {
    const clientId = (window.__env__?.GOOGLE_CLIENT_ID) ?? '';
    if (!clientId || !window.google?.accounts) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: ({ credential }) => {
        this.zone.run(() => this.oauthLogin.emit({ provider: 'google', idToken: credential }));
      },
    });

    if (this.googleBtnRef?.nativeElement) {
      window.google.accounts.id.renderButton(this.googleBtnRef.nativeElement, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: this.buttonText,
      });
    }
  }

  // ── Apple ───────────────────────────────────────────────────────────────────
  private loadAppleJS(): void {
    if (window.AppleID?.auth) {
      this.initApple();
      return;
    }

    this.appleScriptEl = document.createElement('script');
    this.appleScriptEl.src =
      'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
    this.appleScriptEl.async = true;
    this.appleScriptEl.onload = () => this.zone.run(() => this.initApple());
    document.head.appendChild(this.appleScriptEl);
  }

  private initApple(): void {
    const clientId = (window.__env__?.APPLE_CLIENT_ID) ?? '';
    if (!clientId || !window.AppleID?.auth) {
      return;
    }

    window.AppleID.auth.init({
      clientId,
      scope: 'email name',
      redirectURI: window.location.origin,
      usePopup: true,
    });
  }

  async signInWithApple(): Promise<void> {
    if (!window.AppleID?.auth) {
      return;
    }
    try {
      const result = await window.AppleID.auth.signIn();
      this.zone.run(() =>
        this.oauthLogin.emit({ provider: 'apple', idToken: result.authorization.id_token }),
      );
    } catch {
      // User closed the popup — no action needed
    }
  }
}
