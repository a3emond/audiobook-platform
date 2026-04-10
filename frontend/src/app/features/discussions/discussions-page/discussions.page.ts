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
} from '../../../core/models/api.models';
import { AuthService } from '../../../core/services/auth.service';
import { DiscussionService } from '../../../core/services/discussion.service';
import { I18nService } from '../../../core/services/i18n.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import {
  canDeleteChannel,
  formatDiscussionDate,
  hasOriginalInLoadedMessages,
  messageDomId,
  previewBody,
  validateNewChannelInput,
} from './discussions-page.utils';

@Component({
  selector: 'app-discussions-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './discussions.page.html',
  styleUrl: './discussions.page.css',
})
// Main UI/state logic for this standalone view component.
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
  readonly hasOlderMessages = signal(false);
  readonly loadingOlderMessages = signal(false);

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
    if (!validateNewChannelInput(title, description)) {
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
    return canDeleteChannel(channel);
  }

  hasOriginalInLoadedMessages(replyToMessageId?: string): boolean {
    return hasOriginalInLoadedMessages(this.messages(), replyToMessageId);
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
    return messageDomId(messageId);
  }

  previewBody(body: string): string {
    return previewBody(body);
  }

  formatDate(value?: string): string {
    return formatDiscussionDate(this.lang(), value);
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
        this.hasOlderMessages.set(response.hasMore);
        this.statusText.set(null);
      },
      error: () => {
        this.messages.set([]);
        this.hasOlderMessages.set(false);
        this.statusText.set('Unable to load messages.');
      },
    });
  }

  loadOlderMessages(): void {
    if (!this.hasOlderMessages() || this.loadingOlderMessages()) {
      return;
    }

    const oldest = this.messages()[0];
    if (!oldest) {
      return;
    }

    this.loadingOlderMessages.set(true);

    this.discussion.listMessages(this.lang(), this.channelKey(), 80, oldest.id).subscribe({
      next: (response) => {
        this.messages.update((current) => [...response.messages, ...current]);
        this.hasOlderMessages.set(response.hasMore);
        this.loadingOlderMessages.set(false);
      },
      error: () => {
        this.loadingOlderMessages.set(false);
      },
    });
  }

  private focusComposer(): void {
    window.setTimeout(() => {
      this.messageInputRef?.nativeElement.focus();
    }, 0);
  }
}
