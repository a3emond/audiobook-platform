import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import type {
  DiscussionChannel,
  DiscussionChannelKey,
  DiscussionLanguage,
  DiscussionMessage,
} from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
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
          <div class="channel-row" *ngFor="let channel of channels()">
            <button
              type="button"
              [class.active]="channel.key === channelKey()"
              (click)="selectChannel(channel.key)"
            >
              <strong>{{ channel.title }}</strong>
              <span>{{ channel.description }}</span>
            </button>
            <button
              *ngIf="auth.isAdmin() && canDeleteChannel(channel)"
              type="button"
              class="btn-channel-delete"
              [disabled]="loading()"
              (click)="deleteChannel(channel)"
              [attr.aria-label]="'Delete ' + channel.title"
              title="Delete category"
            >
              Del
            </button>
          </div>

          <form class="channel-admin" *ngIf="auth.isAdmin()" (ngSubmit)="createChannel()">
            <p class="channel-admin-title">Admin channel controls</p>
            <input
              type="text"
              name="newChannelTitle"
              [(ngModel)]="newChannelTitle"
              placeholder="New category title"
              maxlength="80"
            />
            <input
              type="text"
              name="newChannelDescription"
              [(ngModel)]="newChannelDescription"
              placeholder="Short description"
              maxlength="220"
            />
            <input
              type="text"
              name="newChannelKey"
              [(ngModel)]="newChannelKey"
              placeholder="Optional key (slug)"
              maxlength="48"
            />
            <button type="submit" [disabled]="loading() || !newChannelTitle.trim() || !newChannelDescription.trim()">
              Add category
            </button>
          </form>
        </aside>

        <section class="chat card">
          <div class="messages" #messageList>
            <article
              class="message"
              *ngFor="let message of messages()"
              [attr.id]="messageDomId(message.id)"
            >
              <p class="reply-context" *ngIf="message.replyTo as replyTo">
                Replying to <strong>{{ replyTo.authorDisplayName }}</strong>
                <span>"{{ replyTo.bodyPreview }}"</span>
                <button
                  type="button"
                  class="btn-link-original"
                  *ngIf="hasOriginalInLoadedMessages(message.replyToMessageId)"
                  (click)="scrollToOriginal(message.replyToMessageId)"
                >
                  Jump to original
                </button>
              </p>
              <header>
                <div class="author-block">
                  <strong>{{ message.author.displayName }}</strong>
                  <span class="admin-pill" *ngIf="message.author.isAdmin">Admin Team</span>
                </div>
                <div class="message-meta">
                  <time>{{ formatDate(message.createdAt) }}</time>
                  <button
                    type="button"
                    class="btn-reply"
                    (click)="startReply(message)"
                    [disabled]="loading()"
                  >
                    Reply
                  </button>
                  <button
                    *ngIf="auth.isAdmin()"
                    type="button"
                    class="btn-delete"
                    [disabled]="loading()"
                    (click)="deleteMessage(message)"
                  >
                    Delete
                  </button>
                </div>
              </header>
              <p>{{ message.body }}</p>
            </article>

            <p class="empty" *ngIf="messages().length === 0">
              {{ i18n.t('discussions.noMessages') }}
            </p>
          </div>

          <form class="composer" (ngSubmit)="sendMessage()">
            <p class="reply-banner" *ngIf="replyTarget() as target">
              Replying to <strong>{{ target.author.displayName }}</strong>
              <span>"{{ previewBody(target.body) }}"</span>
              <button type="button" (click)="cancelReply()" [disabled]="loading()">Cancel</button>
            </p>
            <input
              #messageInput
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

          <p class="status" *ngIf="statusText()">{{ statusText() }}</p>
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
      .channel-row { display: grid; grid-template-columns: 1fr auto; gap: 0.4rem; align-items: start; }
      .channels button { border: 1px solid var(--color-border); background: #151515; border-radius: 0.75rem; color: var(--color-text); text-align: left; padding: 0.65rem; display: grid; gap: 0.25rem; }
      .channels button span { color: var(--color-text-muted); font-size: 0.82rem; }
      .channels button.active { border-color: #ff8a00; box-shadow: 0 0 0 1px rgb(255 138 0 / 0.35) inset; }
      .btn-channel-delete {
        margin-top: 0.4rem;
        border: 1px solid rgb(248 113 113 / 0.35);
        background: rgb(127 29 29 / 0.2);
        color: #fecaca;
        border-radius: 999px;
        min-width: 2.45rem;
        height: 1.7rem;
        padding: 0 0.45rem;
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }
      .btn-channel-delete:hover {
        background: rgb(127 29 29 / 0.36);
      }
      .channel-admin {
        margin-top: 0.35rem;
        display: grid;
        gap: 0.45rem;
        padding-top: 0.55rem;
        border-top: 1px dashed rgb(255 255 255 / 0.15);
      }
      .channel-admin-title {
        margin: 0;
        font-size: 0.73rem;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .chat { display: grid; grid-template-rows: 1fr auto; gap: 0.75rem; }
      .messages { display: grid; gap: 0.5rem; max-height: 60vh; overflow: auto; padding-right: 0.4rem; }
      .message { position: relative; border: 1px solid var(--color-border); border-radius: 0.7rem; padding: 0.65rem; background: #151515; }
      .message.flash {
        animation: originalFlash 900ms ease;
      }
      .reply-context {
        margin: 0 0 0.4rem;
        padding: 0.35rem 0.5rem;
        border-left: 2px solid rgb(255 138 0 / 0.55);
        border-radius: 0.35rem;
        background: rgb(255 138 0 / 0.08);
        color: var(--color-text-muted);
        font-size: 0.76rem;
        display: grid;
        gap: 0.2rem;
      }
      .reply-context span {
        color: var(--color-text);
      }
      .btn-link-original {
        justify-self: start;
        border: none;
        background: transparent;
        color: #ffd08a;
        text-decoration: underline;
        padding: 0;
        cursor: pointer;
      }
      .message header { display: flex; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.35rem; font-size: 0.82rem; color: var(--color-text-muted); }
      .author-block { display: inline-flex; align-items: center; gap: 0.45rem; }
      .admin-pill {
        border: 1px solid rgb(255 138 0 / 0.45);
        background: rgb(255 138 0 / 0.14);
        color: #ffcd89;
        border-radius: 999px;
        padding: 0.08rem 0.45rem;
        font-size: 0.68rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .message-meta { display: inline-flex; align-items: center; gap: 0.45rem; }
      .btn-reply {
        border: 1px solid var(--color-border);
        border-radius: 999px;
        background: #1e1e1e;
        color: var(--color-text-muted);
        padding: 0.15rem 0.55rem;
        font-size: 0.72rem;
        cursor: pointer;
      }
      .btn-delete {
        border: 1px solid rgb(248 113 113 / 0.4);
        border-radius: 999px;
        background: rgb(127 29 29 / 0.2);
        color: #fca5a5;
        padding: 0.15rem 0.55rem;
        font-size: 0.72rem;
        cursor: pointer;
      }
      .btn-reply:hover { color: var(--color-text); border-color: rgb(255 138 0 / 0.45); }
      .message p { margin: 0; white-space: pre-wrap; line-height: 1.45; }
      .composer { display: grid; grid-template-columns: 1fr auto; gap: 0.6rem; }
      .reply-banner {
        grid-column: 1 / -1;
        margin: 0;
        padding: 0.45rem 0.55rem;
        border: 1px solid rgb(255 138 0 / 0.35);
        border-radius: 0.6rem;
        background: rgb(255 138 0 / 0.1);
        font-size: 0.8rem;
        color: var(--color-text-muted);
        display: flex;
        align-items: center;
        gap: 0.45rem;
        flex-wrap: wrap;
      }
      .reply-banner span { color: var(--color-text); }
      .reply-banner button {
        margin-left: auto;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        background: #171717;
        color: var(--color-text);
        padding: 0.2rem 0.6rem;
      }
      .composer input { min-width: 0; }
      .empty { color: var(--color-text-muted); margin: 0.5rem 0 0; }
      .status { margin: 0; color: #ffd08a; font-size: 0.84rem; }
      @keyframes originalFlash {
        0% { box-shadow: 0 0 0 0 rgb(255 138 0 / 0.55); }
        100% { box-shadow: 0 0 0 14px rgb(255 138 0 / 0); }
      }
      @media (max-width: 900px) {
        .layout { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class DiscussionsPage implements OnInit, OnDestroy {
  @ViewChild('messageInput') messageInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('messageList') messageListRef?: ElementRef<HTMLElement>;

  readonly lang = signal<DiscussionLanguage>('en');
  readonly channels = signal<DiscussionChannel[]>([]);
  readonly channelKey = signal<DiscussionChannelKey>('general');
  readonly messages = signal<DiscussionMessage[]>([]);
  readonly replyingToMessageId = signal<string | null>(null);
  readonly replyTarget = computed<DiscussionMessage | null>(() => {
    const targetId = this.replyingToMessageId();
    if (!targetId) {
      return null;
    }

    return this.messages().find((message) => message.id === targetId) ?? null;
  });
  readonly loading = signal(false);
  readonly statusText = signal<string | null>(null);

  draft = '';
  newChannelTitle = '';
  newChannelDescription = '';
  newChannelKey = '';
  private readonly subs = new Subscription();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly discussion: DiscussionService,
    private readonly realtime: RealtimeService,
    protected readonly auth: AuthService,
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

    this.subs.add(
      this.realtime
        .on<{ messageId?: string; lang?: DiscussionLanguage; channelKey?: DiscussionChannelKey }>(
          'discussion.message.deleted',
        )
        .subscribe((payload) => {
          if (payload.lang !== this.lang() || payload.channelKey !== this.channelKey() || !payload.messageId) {
            return;
          }

          this.messages.update((current) => current.filter((m) => m.id !== payload.messageId));
          if (this.replyingToMessageId() === payload.messageId) {
            this.cancelReply();
          }
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
    this.cancelReply();
    this.statusText.set(null);
    this.loadMessages();
  }

  startReply(message: DiscussionMessage): void {
    this.replyingToMessageId.set(message.id);
    this.focusComposer();
  }

  cancelReply(): void {
    this.replyingToMessageId.set(null);
  }

  sendMessage(): void {
    const body = this.draft.trim();
    if (!body || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.discussion
      .postMessage(this.lang(), this.channelKey(), body, this.replyingToMessageId() ?? undefined)
      .subscribe({
        next: () => {
          this.draft = '';
          this.cancelReply();
          this.loading.set(false);
          this.statusText.set(null);
        },
        error: () => {
          this.loading.set(false);
          this.statusText.set('Unable to send message right now.');
        },
      });
  }

  deleteMessage(message: DiscussionMessage): void {
    if (!this.auth.isAdmin() || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.discussion.deleteMessage(this.lang(), this.channelKey(), message.id).subscribe({
      next: () => {
        this.messages.update((current) => current.filter((item) => item.id !== message.id));
        if (this.replyingToMessageId() === message.id) {
          this.cancelReply();
        }
        this.loading.set(false);
        this.statusText.set('Message deleted.');
      },
      error: () => {
        this.loading.set(false);
        this.statusText.set('Unable to delete this message.');
      },
    });
  }

  createChannel(): void {
    if (!this.auth.isAdmin() || this.loading()) {
      return;
    }

    const title = this.newChannelTitle.trim();
    const description = this.newChannelDescription.trim();
    const key = this.newChannelKey.trim();
    if (!title || !description) {
      return;
    }

    this.loading.set(true);
    this.discussion.createChannel(this.lang(), title, description, key || undefined).subscribe({
      next: (channel) => {
        this.channels.update((current) => [...current, channel]);
        this.newChannelTitle = '';
        this.newChannelDescription = '';
        this.newChannelKey = '';
        this.loading.set(false);
        this.statusText.set('Category created.');
      },
      error: () => {
        this.loading.set(false);
        this.statusText.set('Unable to create category. Use a unique key/title.');
      },
    });
  }

  deleteChannel(channel: DiscussionChannel): void {
    if (!this.auth.isAdmin() || this.loading() || !this.canDeleteChannel(channel)) {
      return;
    }

    this.loading.set(true);
    this.discussion.deleteChannel(this.lang(), channel.key).subscribe({
      next: () => {
        this.channels.update((current) => current.filter((item) => item.key !== channel.key));
        if (this.channelKey() === channel.key) {
          const fallback = this.channels()[0]?.key ?? 'general';
          this.channelKey.set(fallback);
          this.loadMessages();
        }
        this.loading.set(false);
        this.statusText.set('Category removed.');
      },
      error: () => {
        this.loading.set(false);
        this.statusText.set('Unable to remove this category (might contain messages or be protected).');
      },
    });
  }

  canDeleteChannel(channel: DiscussionChannel): boolean {
    return !channel.isDefault;
  }

  hasOriginalInLoadedMessages(replyToMessageId?: string): boolean {
    if (!replyToMessageId) {
      return false;
    }

    return this.messages().some((message) => message.id === replyToMessageId);
  }

  scrollToOriginal(replyToMessageId?: string): void {
    if (!replyToMessageId) {
      return;
    }

    const list = this.messageListRef?.nativeElement;
    const target = list?.querySelector<HTMLElement>(`#${this.messageDomId(replyToMessageId)}`);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('flash');
    window.setTimeout(() => target.classList.remove('flash'), 900);
  }

  messageDomId(messageId: string): string {
    return `msg-${messageId}`;
  }

  previewBody(body: string): string {
    return body.trim().slice(0, 120);
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
        this.cancelReply();
        this.loadMessages();
      },
      error: () => {
        this.channels.set([]);
        this.messages.set([]);
        this.statusText.set('Unable to load discussion channels.');
      },
    });
  }

  private loadMessages(): void {
    this.discussion.listMessages(this.lang(), this.channelKey()).subscribe({
      next: (response) => {
        this.messages.set(response.messages);
        this.statusText.set(null);
      },
      error: () => {
        this.messages.set([]);
        this.statusText.set('Unable to load messages.');
      },
    });
  }

  private focusComposer(): void {
    window.setTimeout(() => {
      this.messageInputRef?.nativeElement.focus();
    }, 0);
  }
}
