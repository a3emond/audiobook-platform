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
  if (
    value === "general" ||
    value === "book-requests" ||
    value === "series-talk" ||
    value === "recommendations"
  ) {
    return value;
  }

  throw new ApiError(400, "discussion_channel_invalid");
}

export class DiscussionController {
  static listChannels(
    req: Request<unknown, unknown, unknown, { lang?: string }>,
    res: Response,
  ): void {
    const lang = parseLang(req.query.lang ?? "en");
    res.status(200).json({ channels: DiscussionService.listChannels(lang) });
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
    req: Request<{ lang?: string; channelKey?: string }, unknown, { body?: string }>,
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
    );

    res.status(201).json(message);
  }
}
