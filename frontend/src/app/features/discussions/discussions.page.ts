import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import type {
  DiscussionChannel,
  DiscussionLanguage,
  DiscussionMessage,
} from '../../core/models/api.models';
import { DiscussionService } from '../../core/services/discussion.service';
import { I18nService } from '../../core/services/i18n.service';
import { RealtimeService } from '../../core/services/realtime.service';

@Component({
  selector: 'app-discussions-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page-shell discussions-page">
      <header class="head">
        <h1>{{ i18n.t('discussions.title') }}</h1>
        <div class="lang-toggle">
          <button type="button" [class.active]="lang() === 'en'" (click)="switchLang('en')">
            {{ i18n.t('discussions.lang.en') }}
          </button>
          <button type="button" [class.active]="lang() === 'fr'" (click)="switchLang('fr')">
            {{ i18n.t('discussions.lang.fr') }}
          </button>
        </div>
      </header>

      <div class="layout">
        <aside class="channels card">
          <button
            type="button"
            *ngFor="let channel of channels()"
            [class.active]="channel.key === channelKey()"
            (click)="selectChannel(channel.key)"
          >
            <strong>{{ channel.title }}</strong>
            <span>{{ channel.description }}</span>
          </button>
        </aside>

        <section class="chat card">
          <div class="messages">
            <article class="message" *ngFor="let message of messages()">
              <header>
                <strong>{{ message.author.displayName }}</strong>
                <time>{{ formatDate(message.createdAt) }}</time>
              </header>
              <p>{{ message.body }}</p>
            </article>

            <p class="empty" *ngIf="messages().length === 0">
              {{ i18n.t('discussions.noMessages') }}
            </p>
          </div>

          <form class="composer" (ngSubmit)="sendMessage()">
            <input
              type="text"
              name="message"
              [(ngModel)]="draft"
              [placeholder]="i18n.t('discussions.placeholder')"
              autocomplete="off"
            />
            <button type="submit" [disabled]="loading() || !draft.trim()">
              {{ i18n.t('discussions.send') }}
            </button>
          </form>
        </section>
      </div>
    </section>
  `,
  styles: [
    `
      .discussions-page { display: grid; gap: 1rem; }
      .head { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; }
      .head h1 { margin: 0; }
      .lang-toggle { display: inline-flex; border: 1px solid var(--color-border); border-radius: 999px; overflow: hidden; }
      .lang-toggle button { border: none; background: #151515; color: var(--color-text-muted); padding: 0.35rem 0.75rem; }
      .lang-toggle button.active { background: #2a2a2a; color: var(--color-text); }
      .layout { display: grid; grid-template-columns: 280px 1fr; gap: 1rem; min-height: 60vh; }
      .channels { display: grid; gap: 0.5rem; align-content: start; }
      .channels button { border: 1px solid var(--color-border); background: #151515; border-radius: 0.75rem; color: var(--color-text); text-align: left; padding: 0.65rem; display: grid; gap: 0.25rem; }
      .channels button span { color: var(--color-text-muted); font-size: 0.82rem; }
      .channels button.active { border-color: #ff8a00; box-shadow: 0 0 0 1px rgb(255 138 0 / 0.35) inset; }
      .chat { display: grid; grid-template-rows: 1fr auto; gap: 0.75rem; }
      .messages { display: grid; gap: 0.5rem; max-height: 60vh; overflow: auto; padding-right: 0.4rem; }
      .message { border: 1px solid var(--color-border); border-radius: 0.7rem; padding: 0.65rem; background: #151515; }
      .message header { display: flex; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.35rem; font-size: 0.82rem; color: var(--color-text-muted); }
      .message p { margin: 0; white-space: pre-wrap; line-height: 1.45; }
      .composer { display: grid; grid-template-columns: 1fr auto; gap: 0.6rem; }
      .composer input { min-width: 0; }
      .empty { color: var(--color-text-muted); margin: 0.5rem 0 0; }
      @media (max-width: 900px) {
        .layout { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class DiscussionsPage implements OnInit, OnDestroy {
  readonly lang = signal<DiscussionLanguage>('en');
  readonly channels = signal<DiscussionChannel[]>([]);
  readonly channelKey = signal<string>('general');
  readonly messages = signal<DiscussionMessage[]>([]);
  readonly loading = signal(false);

  draft = '';
  private readonly subs = new Subscription();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly discussion: DiscussionService,
    private readonly realtime: RealtimeService,
    protected readonly i18n: I18nService,
  ) {}

  ngOnInit(): void {
    this.realtime.connect();

    this.subs.add(
      this.route.paramMap.subscribe((params) => {
        const lang = params.get('lang') === 'fr' ? 'fr' : 'en';
        this.lang.set(lang);
        void this.i18n.setLocale(lang);
        this.loadChannels();
      }),
    );

    this.subs.add(
      this.realtime.on<{ message?: DiscussionMessage }>('discussion.message.created').subscribe((payload) => {
        const message = payload.message;
        if (!message) {
          return;
        }

        if (message.lang !== this.lang() || message.channelKey !== this.channelKey()) {
          return;
        }

        this.messages.update((current) => [...current, message]);
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  switchLang(next: DiscussionLanguage): void {
    void this.router.navigate(['/discussions', next]);
  }

  selectChannel(channelKey: string): void {
    this.channelKey.set(channelKey);
    this.loadMessages();
  }

  sendMessage(): void {
    const body = this.draft.trim();
    if (!body || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.discussion.postMessage(this.lang(), this.channelKey(), body).subscribe({
      next: () => {
        this.draft = '';
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  formatDate(value?: string): string {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(this.lang(), {
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      day: '2-digit',
    }).format(date);
  }

  private loadChannels(): void {
    this.discussion.listChannels(this.lang()).subscribe({
      next: (response) => {
        this.channels.set(response.channels);
        const currentKey = this.channelKey();
        const available = response.channels.some((channel) => channel.key === currentKey);
        const nextKey = available ? currentKey : response.channels[0]?.key ?? 'general';
        this.channelKey.set(nextKey);
        this.loadMessages();
      },
      error: () => {
        this.channels.set([]);
        this.messages.set([]);
      },
    });
  }

  private loadMessages(): void {
    this.discussion.listMessages(this.lang(), this.channelKey()).subscribe({
      next: (response) => {
        this.messages.set(response.messages);
      },
      error: () => {
        this.messages.set([]);
      },
    });
  }
}
