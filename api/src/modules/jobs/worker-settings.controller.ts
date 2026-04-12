/**
 * HTTP controller for background job queueing, worker coordination, and job observability.
 * Controllers in this API are intentionally thin: they translate Express
 * request data into validated service inputs and choose response status codes,
 * while the real business rules live below in the service/model layer.
 */
import { Request, Response } from "express";

import { WorkerSettingsService } from "./worker-settings.service.js";
import type { JobType } from "./job.model.js";

export class WorkerSettingsController {
  static async get(_req: Request, res: Response) {
    const settings = await WorkerSettingsService.getSettings();
    res.status(200).json(settings);
  }

  static async update(
    req: Request<
      unknown,
      unknown,
      {
        queue?: {
          heavyJobTypes?: JobType[];
          heavyJobDelayMs?: number;
          heavyWindowEnabled?: boolean;
          heavyWindowStart?: string;
          heavyWindowEnd?: string;
          heavyConcurrency?: number;
          fastConcurrency?: number;
        };
        parity?: {
          enabled?: boolean;
          intervalMs?: number;
        };
        taxonomy?: {
          enabled?: boolean;
          intervalMs?: number;
        };
      }
    >,
    res: Response,
  ) {
    const settings = await WorkerSettingsService.updateSettings(req.body);
    res.status(200).json(settings);
  }
}
