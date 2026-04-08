import { IdDTO, TimestampDTO } from "./common.dto.js";

export type DiscussionLang = "en" | "fr";

export type DiscussionChannelKey =
  | "general"
  | "book-requests"
  | "series-talk"
  | "recommendations";

export interface DiscussionChannelDTO {
  key: DiscussionChannelKey;
  lang: DiscussionLang;
  title: string;
  description: string;
}

export interface DiscussionMessageDTO extends IdDTO, TimestampDTO {
  channelKey: DiscussionChannelKey;
  lang: DiscussionLang;
  body: string;
  author: {
    id: string;
    displayName: string;
  };
}

export interface ListDiscussionMessagesResponseDTO {
  messages: DiscussionMessageDTO[];
  hasMore: boolean;
}
