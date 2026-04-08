import mongoose from "mongoose";

import type {
  DiscussionChannelDTO,
  DiscussionChannelKey,
  DiscussionLang,
  DiscussionMessageDTO,
  ListDiscussionMessagesResponseDTO,
} from "../../dto/discussion.dto.js";
import { emitRealtimeEvent } from "../../realtime/realtime.events.js";
import { ApiError } from "../../utils/api-error.js";
import { UserModel } from "../users/user.model.js";
import {
  DiscussionMessageModel,
  type DiscussionMessageDocument,
} from "./discussion-message.model.js";

const CHANNELS_BY_LANG: Record<DiscussionLang, DiscussionChannelDTO[]> = {
  en: [
    {
      key: "general",
      lang: "en",
      title: "General",
      description: "General discussion about StoryWave.",
    },
    {
      key: "book-requests",
      lang: "en",
      title: "Book Requests",
      description: "Request audiobooks you want to see in the catalog.",
    },
    {
      key: "series-talk",
      lang: "en",
      title: "Series Talk",
      description: "Discuss books and series progression.",
    },
    {
      key: "recommendations",
      lang: "en",
      title: "Recommendations",
      description: "Share and receive listening recommendations.",
    },
  ],
  fr: [
    {
      key: "general",
      lang: "fr",
      title: "General",
      description: "Discussion generale autour de StoryWave.",
    },
    {
      key: "book-requests",
      lang: "fr",
      title: "Demandes de livres",
      description: "Demandez les livres audio a ajouter au catalogue.",
    },
    {
      key: "series-talk",
      lang: "fr",
      title: "Discussion de series",
      description: "Discutez des series et de leur progression.",
    },
    {
      key: "recommendations",
      lang: "fr",
      title: "Recommandations",
      description: "Partagez vos recommandations d'ecoute.",
    },
  ],
};

function toMessageDTO(
  message: DiscussionMessageDocument,
  author: { id: string; displayName: string },
): DiscussionMessageDTO {
  return {
    id: String(message._id),
    channelKey: message.channelKey,
    lang: message.lang,
    body: message.body,
    author,
    createdAt: message.createdAt?.toISOString(),
    updatedAt: message.updatedAt?.toISOString(),
  };
}

export class DiscussionService {
  static listChannels(lang: DiscussionLang): DiscussionChannelDTO[] {
    return CHANNELS_BY_LANG[lang];
  }

  static async listMessages(
    lang: DiscussionLang,
    channelKey: DiscussionChannelKey,
    limit = 50,
    before?: string,
  ): Promise<ListDiscussionMessagesResponseDTO> {
    this.assertChannel(lang, channelKey);

    const cappedLimit = Math.min(100, Math.max(1, limit));
    const query: Record<string, unknown> = { lang, channelKey };

    if (before) {
      const beforeDate = new Date(before);
      if (!Number.isNaN(beforeDate.getTime())) {
        query.createdAt = { $lt: beforeDate };
      }
    }

    const docs = await DiscussionMessageModel.find(query)
      .sort({ createdAt: -1 })
      .limit(cappedLimit + 1);

    const hasMore = docs.length > cappedLimit;
    const pageDocs = (hasMore ? docs.slice(0, cappedLimit) : docs).reverse();
    const authorIds = Array.from(new Set(pageDocs.map((d) => String(d.authorUserId))));

    const users = await UserModel.find({ _id: { $in: authorIds } })
      .select("_id email profile.displayName")
      .lean();

    const authorById = new Map(
      users.map((u) => [
        String(u._id),
        {
          id: String(u._id),
          displayName: u.profile?.displayName || u.email,
        },
      ]),
    );

    return {
      messages: pageDocs.map((doc) =>
        toMessageDTO(doc, authorById.get(String(doc.authorUserId)) ?? {
          id: String(doc.authorUserId),
          displayName: "Unknown user",
        }),
      ),
      hasMore,
    };
  }

  static async postMessage(
    userId: string,
    lang: DiscussionLang,
    channelKey: DiscussionChannelKey,
    body: string,
  ): Promise<DiscussionMessageDTO> {
    this.assertChannel(lang, channelKey);

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ApiError(400, "invalid_user_id");
    }

    const sanitizedBody = body.trim();
    if (!sanitizedBody) {
      throw new ApiError(400, "discussion_message_required");
    }

    if (sanitizedBody.length > 2000) {
      throw new ApiError(400, "discussion_message_too_long");
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      throw new ApiError(404, "user_not_found");
    }

    const message = await DiscussionMessageModel.create({
      authorUserId: user._id,
      lang,
      channelKey,
      body: sanitizedBody,
    });

    const dto = toMessageDTO(message, {
      id: String(user._id),
      displayName: user.profile?.displayName || user.email,
    });

    emitRealtimeEvent("discussion.message.created", {
      message: dto,
    });

    return dto;
  }

  private static assertChannel(lang: DiscussionLang, channelKey: DiscussionChannelKey): void {
    const allowed = CHANNELS_BY_LANG[lang].some((channel) => channel.key === channelKey);
    if (!allowed) {
      throw new ApiError(400, "discussion_channel_invalid");
    }
  }
}
