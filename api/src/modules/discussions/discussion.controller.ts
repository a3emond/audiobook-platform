import { type Request, type Response } from "express";

import type {
  DiscussionChannelKey,
  DiscussionLang,
} from "../../dto/discussion.dto.js";
import { type AuthenticatedRequest } from "../../middlewares/auth.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { DiscussionService } from "./discussion.service.js";

function parseLang(value: string | undefined): DiscussionLang {
  if (value === "en" || value === "fr") {
    return value;
  }

  throw new ApiError(400, "discussion_lang_invalid");
}

function parseChannel(value: string | undefined): DiscussionChannelKey {
  if (value && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    return value;
  }

  throw new ApiError(400, "discussion_channel_invalid");
}

export class DiscussionController {
  static listChannels(
    req: Request<unknown, unknown, unknown, { lang?: string }>,
    res: Response,
  ): Promise<void> {
    const lang = parseLang(req.query.lang ?? "en");
    return DiscussionService.listChannels(lang).then((channels) => {
      res.status(200).json({ channels });
    });
  }

  static async listMessages(
    req: Request<
      { lang?: string; channelKey?: string },
      unknown,
      unknown,
      { limit?: string; before?: string }
    >,
    res: Response,
  ): Promise<void> {
    const lang = parseLang(req.params.lang);
    const channelKey = parseChannel(req.params.channelKey);
    const parsedLimit = req.query.limit ? Number(req.query.limit) : undefined;
    const limit = parsedLimit && Number.isFinite(parsedLimit) ? parsedLimit : undefined;

    const response = await DiscussionService.listMessages(
      lang,
      channelKey,
      limit,
      req.query.before,
    );

    res.status(200).json(response);
  }

  static async postMessage(
    req: Request<
      { lang?: string; channelKey?: string },
      unknown,
      { body?: string; replyToMessageId?: string }
    >,
    res: Response,
  ): Promise<void> {
    const userId = (req as AuthenticatedRequest).user?.id as string;
    const lang = parseLang(req.params.lang);
    const channelKey = parseChannel(req.params.channelKey);

    const message = await DiscussionService.postMessage(
      userId,
      lang,
      channelKey,
      req.body.body ?? "",
      req.body.replyToMessageId,
    );

    res.status(201).json(message);
  }

  static async deleteMessageByAdmin(
    req: Request<{ lang?: string; channelKey?: string; messageId?: string }>,
    res: Response,
  ): Promise<void> {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.role !== "admin") {
      throw new ApiError(403, "forbidden");
    }

    const lang = parseLang(req.params.lang);
    const channelKey = parseChannel(req.params.channelKey);
    const messageId = String(req.params.messageId ?? "");

    await DiscussionService.deleteMessageByAdmin(lang, channelKey, messageId);
    res.status(204).end();
  }

  static async createChannelByAdmin(
    req: Request<unknown, unknown, { lang?: string; title?: string; description?: string; key?: string }>,
    res: Response,
  ): Promise<void> {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.role !== "admin") {
      throw new ApiError(403, "forbidden");
    }

    const lang = parseLang(req.body.lang);
    const title = req.body.title ?? "";
    const description = req.body.description ?? "";

    const channel = await DiscussionService.createChannelByAdmin(
      lang,
      title,
      description,
      req.body.key,
    );
    res.status(201).json(channel);
  }

  static async deleteChannelByAdmin(
    req: Request<{ lang?: string; channelKey?: string }>,
    res: Response,
  ): Promise<void> {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.role !== "admin") {
      throw new ApiError(403, "forbidden");
    }

    const lang = parseLang(req.params.lang);
    const channelKey = parseChannel(req.params.channelKey);

    await DiscussionService.deleteChannelByAdmin(lang, channelKey);
    res.status(204).end();
  }
}
