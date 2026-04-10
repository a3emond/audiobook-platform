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
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

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
  imports: [CommonModule, TranslatePipe],
  templateUrl: './oauth-buttons.html',
  styleUrl: './oauth-buttons.css',
})
// Main UI/state logic for this standalone view component.
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
        theme: 'filled_black',
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
