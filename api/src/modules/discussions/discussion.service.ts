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
  DiscussionChannelModel,
  type DiscussionChannelDocument,
} from "./discussion-channel.model.js";
import {
  DiscussionMessageModel,
  type DiscussionMessageDocument,
} from "./discussion-message.model.js";

interface ReplyTargetDoc {
  _id: mongoose.Types.ObjectId;
  lang: DiscussionLang;
  channelKey: DiscussionChannelKey;
  authorUserId: mongoose.Types.ObjectId;
  body: string;
}

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

// Channel keys are user/admin input and must stay URL-safe and stable.
function sanitizeChannelKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toChannelDTO(channel: DiscussionChannelDocument): DiscussionChannelDTO {
  return {
    key: channel.key,
    lang: channel.lang,
    title: channel.title,
    description: channel.description,
    isDefault: channel.isDefault,
  };
}

function toMessageDTO(
  message: DiscussionMessageDocument,
  author: { id: string; displayName: string; isAdmin: boolean },
  replyTo?: { id: string; authorDisplayName: string; bodyPreview: string },
): DiscussionMessageDTO {
  return {
    id: String(message._id),
    channelKey: message.channelKey,
    lang: message.lang,
    body: message.body,
    author,
    replyToMessageId: message.replyToMessageId ? String(message.replyToMessageId) : undefined,
    replyTo,
    createdAt: message.createdAt?.toISOString(),
    updatedAt: message.updatedAt?.toISOString(),
  };
}

export class DiscussionService {
  // Channel list is lazily bootstrapped with defaults per language.
  static async listChannels(lang: DiscussionLang): Promise<DiscussionChannelDTO[]> {
    await this.ensureDefaultChannels(lang);

    const channels = await DiscussionChannelModel.find({
      lang,
      isActive: true,
    })
      .sort({ isDefault: -1, title: 1 })
      .lean();

    return channels.map((channel) => ({
      key: channel.key,
      lang: channel.lang,
      title: channel.title,
      description: channel.description,
      isDefault: channel.isDefault,
    }));
  }

  // Message listing loads author and reply-preview metadata in batches to avoid N+1 lookups.
  static async listMessages(
    lang: DiscussionLang,
    channelKey: DiscussionChannelKey,
    limit = 50,
    before?: string,
  ): Promise<ListDiscussionMessagesResponseDTO> {
    await this.assertChannel(lang, channelKey);

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
    const replyToIds = Array.from(
      new Set(
        pageDocs
          .map((d) => (d.replyToMessageId ? String(d.replyToMessageId) : null))
          .filter((id): id is string => !!id),
      ),
    );

    const replyDocs = replyToIds.length
      ? await DiscussionMessageModel.find({ _id: { $in: replyToIds } })
          .select("_id authorUserId body")
          .lean()
      : [];

    const replyAuthorIds = Array.from(
      new Set(replyDocs.map((doc) => String(doc.authorUserId))),
    );
    const allAuthorIds = Array.from(new Set([...authorIds, ...replyAuthorIds]));

    const users = await UserModel.find({ _id: { $in: allAuthorIds } })
      .select("_id email role profile.displayName")
      .lean();

    const authorById = new Map(
      users.map((u) => [
        String(u._id),
        {
          id: String(u._id),
          displayName: u.profile?.displayName || u.email,
          isAdmin: u.role === "admin",
        },
      ]),
    );

    const replyById = new Map(
      replyDocs.map((doc) => {
        const author =
          authorById.get(String(doc.authorUserId)) ?? {
            id: String(doc.authorUserId),
            displayName: "Unknown user",
            isAdmin: false,
          };
        return [
          String(doc._id),
          {
            id: String(doc._id),
            authorDisplayName: author.displayName,
            bodyPreview: String(doc.body ?? "").trim().slice(0, 140),
          },
        ] as const;
      }),
    );

    return {
      messages: pageDocs.map((doc) =>
        toMessageDTO(
          doc,
          authorById.get(String(doc.authorUserId)) ?? {
            id: String(doc.authorUserId),
            displayName: "Unknown user",
            isAdmin: false,
          },
          doc.replyToMessageId
            ? replyById.get(String(doc.replyToMessageId))
            : undefined,
        ),
      ),
      hasMore,
    };
  }

  // Posting validates body, optional reply target, and emits realtime updates
  // to keep active clients synchronized.
  static async postMessage(
    userId: string,
    lang: DiscussionLang,
    channelKey: DiscussionChannelKey,
    body: string,
    replyToMessageId?: string,
  ): Promise<DiscussionMessageDTO> {
    await this.assertChannel(lang, channelKey);

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

    let replyToDoc: ReplyTargetDoc | null = null;
    if (replyToMessageId) {
      if (!mongoose.Types.ObjectId.isValid(replyToMessageId)) {
        throw new ApiError(400, "discussion_reply_invalid_id");
      }

      replyToDoc = await DiscussionMessageModel.findById(replyToMessageId)
        .select("_id lang channelKey authorUserId body")
        .lean<ReplyTargetDoc>();

      if (!replyToDoc) {
        throw new ApiError(404, "discussion_reply_not_found");
      }

      if (replyToDoc.lang !== lang || replyToDoc.channelKey !== channelKey) {
        throw new ApiError(400, "discussion_reply_cross_channel_not_allowed");
      }
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
      replyToMessageId: replyToDoc?._id,
    });

    let replyTo: { id: string; authorDisplayName: string; bodyPreview: string } | undefined;
    if (replyToDoc) {
      let authorDisplayName = "Unknown user";
      if (String(replyToDoc.authorUserId) === String(user._id)) {
        authorDisplayName = user.profile?.displayName || user.email;
      } else {
        const replyAuthor = await UserModel.findById(replyToDoc.authorUserId)
          .select("email profile.displayName")
          .lean();
        authorDisplayName =
          replyAuthor?.profile?.displayName || replyAuthor?.email || "Unknown user";
      }

      replyTo = {
        id: String(replyToDoc._id),
        authorDisplayName,
        bodyPreview: String(replyToDoc.body ?? "").trim().slice(0, 140),
      };
    }

    const dto = toMessageDTO(
      message,
      {
        id: String(user._id),
        displayName: user.profile?.displayName || user.email,
        isAdmin: user.role === "admin",
      },
      replyTo,
    );

    emitRealtimeEvent("discussion.message.created", {
      message: dto,
    });

    return dto;
  }

  static async deleteMessageByAdmin(
    lang: DiscussionLang,
    channelKey: DiscussionChannelKey,
    messageId: string,
  ): Promise<void> {
    await this.assertChannel(lang, channelKey);

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      throw new ApiError(400, "discussion_message_invalid_id");
    }

    const deleted = await DiscussionMessageModel.findOneAndDelete({
      _id: messageId,
      lang,
      channelKey,
    }).lean();

    if (!deleted) {
      throw new ApiError(404, "discussion_message_not_found");
    }

    emitRealtimeEvent("discussion.message.deleted", {
      messageId,
      lang,
      channelKey,
    });
  }

  static async createChannelByAdmin(
    lang: DiscussionLang,
    title: string,
    description: string,
    key?: string,
  ): Promise<DiscussionChannelDTO> {
    await this.ensureDefaultChannels(lang);

    const sanitizedTitle = title.trim();
    const sanitizedDescription = description.trim();
    const candidate = key?.trim() ? key : sanitizedTitle;
    const sanitizedKey = sanitizeChannelKey(candidate || "");

    if (sanitizedTitle.length < 2 || sanitizedTitle.length > 80) {
      throw new ApiError(400, "discussion_channel_title_invalid");
    }

    if (sanitizedDescription.length < 2 || sanitizedDescription.length > 220) {
      throw new ApiError(400, "discussion_channel_description_invalid");
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sanitizedKey)) {
      throw new ApiError(400, "discussion_channel_key_invalid");
    }

    const existing = await DiscussionChannelModel.findOne({
      lang,
      key: sanitizedKey,
      isActive: true,
    }).lean();
    if (existing) {
      throw new ApiError(409, "discussion_channel_key_conflict");
    }

    const created = await DiscussionChannelModel.create({
      key: sanitizedKey,
      lang,
      title: sanitizedTitle,
      description: sanitizedDescription,
      isDefault: false,
      isActive: true,
    });

    return toChannelDTO(created);
  }

  static async deleteChannelByAdmin(
    lang: DiscussionLang,
    channelKey: DiscussionChannelKey,
  ): Promise<void> {
    const channel = await DiscussionChannelModel.findOne({
      lang,
      key: channelKey,
      isActive: true,
    });

    if (!channel) {
      throw new ApiError(404, "discussion_channel_not_found");
    }

    if (channel.isDefault) {
      throw new ApiError(400, "discussion_channel_default_protected");
    }

    const hasMessages = await DiscussionMessageModel.exists({ lang, channelKey });
    if (hasMessages) {
      throw new ApiError(409, "discussion_channel_not_empty");
    }

    channel.isActive = false;
    await channel.save();
  }

  private static async assertChannel(
    lang: DiscussionLang,
    channelKey: DiscussionChannelKey,
  ): Promise<void> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(channelKey)) {
      throw new ApiError(400, "discussion_channel_invalid");
    }

    await this.ensureDefaultChannels(lang);

    const channel = await DiscussionChannelModel.findOne({
      lang,
      key: channelKey,
      isActive: true,
    })
      .select("_id")
      .lean();

    if (!channel) {
      throw new ApiError(400, "discussion_channel_invalid");
    }
  }

  private static async ensureDefaultChannels(lang: DiscussionLang): Promise<void> {
    const defaults = CHANNELS_BY_LANG[lang];
    await Promise.all(
      defaults.map((channel) =>
        DiscussionChannelModel.updateOne(
          { lang, key: channel.key },
          {
            $setOnInsert: {
              lang,
              key: channel.key,
              title: channel.title,
              description: channel.description,
              isDefault: true,
              isActive: true,
            },
          },
          { upsert: true },
        ),
      ),
    );
  }
}
