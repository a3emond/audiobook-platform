import { IdDTO, TimestampDTO } from "./common.dto.js";

export type DiscussionLang = "en" | "fr";

export type DiscussionChannelKey = string;

export interface DiscussionChannelDTO {
  key: DiscussionChannelKey;
  lang: DiscussionLang;
  title: string;
  description: string;
  isDefault?: boolean;
}

export interface DiscussionMessageDTO extends IdDTO, TimestampDTO {
  channelKey: DiscussionChannelKey;
  lang: DiscussionLang;
  body: string;
  author: {
    id: string;
    displayName: string;
    isAdmin: boolean;
  };
  replyToMessageId?: string;
  replyTo?: {
    id: string;
    authorDisplayName: string;
    bodyPreview: string;
  };
}

export interface ListDiscussionMessagesResponseDTO {
  messages: DiscussionMessageDTO[];
  hasMore: boolean;
}
