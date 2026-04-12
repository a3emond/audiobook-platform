/**
 * ============================================================
 * discussion.service.ts
 * ============================================================
 *
 * Wraps the community-discussion API: channels, paginated message
 * lists, posting, and deletion. Both admin and user operations are
 * combined here since they share the same route tree.
 *
 * Exported:
 *   DiscussionService — root-level injectable
 *
 * Methods:
 *   listChannels(lang)                        — Observable<{channels}>
 *   listMessages(lang, channel, limit, before?) — Observable<...Response>
 *   postMessage(lang, channel, body, replyTo?) — Observable<DiscussionMessage>
 *   deleteMessage(lang, channel, messageId)   — Observable<void>
 *   createChannel(lang, title, desc, key?)    — Observable<DiscussionChannel>
 *   deleteChannel(lang, channelKey)           — Observable<void>
 * ============================================================
 */
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import type {
  DiscussionChannel,
  DiscussionLanguage,
  DiscussionMessage,
  ListDiscussionMessagesResponse,
} from '../models/api.models';
import { ApiService } from './api.service';

/** Wraps the community-discussion API: channels, paginated messages, post, and delete. */
@Injectable({ providedIn: 'root' })
export class DiscussionService {
  constructor(private readonly api: ApiService) {}

  listChannels(lang: DiscussionLanguage): Observable<{ channels: DiscussionChannel[] }> {
    return this.api.get<{ channels: DiscussionChannel[] }>('/discussions/channels', {
      params: { lang },
    });
  }

  listMessages(
    lang: DiscussionLanguage,
    channelKey: string,
    limit = 80,
    before?: string,
  ): Observable<ListDiscussionMessagesResponse> {
    return this.api.get<ListDiscussionMessagesResponse>(`/discussions/${lang}/${channelKey}/messages`, {
      params: {
        limit,
        before,
      },
    });
  }

  postMessage(
    lang: DiscussionLanguage,
    channelKey: string,
    body: string,
    replyToMessageId?: string,
  ): Observable<DiscussionMessage> {
    return this.api.post<DiscussionMessage, { body: string; replyToMessageId?: string }>(
      `/discussions/${lang}/${channelKey}/messages`,
      {
        body,
        replyToMessageId,
      },
    );
  }

  deleteMessage(lang: DiscussionLanguage, channelKey: string, messageId: string): Observable<void> {
    return this.api.delete<void>(`/discussions/${lang}/${channelKey}/messages/${messageId}`);
  }

  createChannel(
    lang: DiscussionLanguage,
    title: string,
    description: string,
    key?: string,
  ): Observable<DiscussionChannel> {
    return this.api.post<DiscussionChannel, { lang: DiscussionLanguage; title: string; description: string; key?: string }>(
      '/discussions/channels',
      {
        lang,
        title,
        description,
        key,
      },
    );
  }

  deleteChannel(lang: DiscussionLanguage, channelKey: string): Observable<void> {
    return this.api.delete<void>(`/discussions/${lang}/${channelKey}`);
  }
}
