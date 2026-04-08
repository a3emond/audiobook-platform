import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import type {
  DiscussionChannel,
  DiscussionLanguage,
  DiscussionMessage,
  ListDiscussionMessagesResponse,
} from '../models/api.models';
import { ApiService } from './api.service';

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

  postMessage(lang: DiscussionLanguage, channelKey: string, body: string): Observable<DiscussionMessage> {
    return this.api.post<DiscussionMessage, { body: string }>(`/discussions/${lang}/${channelKey}/messages`, {
      body,
    });
  }
}
