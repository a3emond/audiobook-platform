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
      }
    >,
    res: Response,
  ) {
    const settings = await WorkerSettingsService.updateSettings(req.body);
    res.status(200).json(settings);
  }
}
