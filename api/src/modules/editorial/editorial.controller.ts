import { type Request, type Response } from "express";

import type {
  CreateEditorialBlockDTO,
  ReplaceEditorialBlockItemsDTO,
  UpdateEditorialBlockDTO,
} from "../../dto/editorial.dto.js";
import { EditorialService } from "./editorial.service.js";

export class EditorialController {
  static async listCatalogOptions(_req: Request, res: Response) {
    const result = await EditorialService.listCatalogOptions();
    res.status(200).json(result);
  }

  static async listActiveBlocks(
    req: Request<unknown, unknown, unknown, { scope?: string }>,
    res: Response,
  ) {
    const scope = req.query.scope?.trim() || "library";
    const result = await EditorialService.listActiveBlocks(scope);
    res.status(200).json(result);
  }

  static async listAdminBlocks(_req: Request, res: Response) {
    const result = await EditorialService.listAdminBlocks();
    res.status(200).json(result);
  }

  static async createBlock(req: Request<unknown, unknown, CreateEditorialBlockDTO>, res: Response) {
    const result = await EditorialService.createBlock(req.body);
    res.status(201).json(result);
  }

  static async updateBlock(
    req: Request<{ blockId?: string }, unknown, UpdateEditorialBlockDTO>,
    res: Response,
  ) {
    const result = await EditorialService.updateBlock(String(req.params.blockId), req.body);
    res.status(200).json(result);
  }

  static async deleteBlock(req: Request<{ blockId?: string }>, res: Response<{ deleted: true }>) {
    await EditorialService.deleteBlock(String(req.params.blockId));
    res.status(200).json({ deleted: true });
  }

  static async replaceItems(
    req: Request<{ blockId?: string }, unknown, ReplaceEditorialBlockItemsDTO>,
    res: Response,
  ) {
    const result = await EditorialService.replaceBlockItems(String(req.params.blockId), req.body);
    res.status(200).json(result);
  }
}
