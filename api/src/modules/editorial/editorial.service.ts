import mongoose from "mongoose";

import type {
  CreateEditorialBlockDTO,
  EditorialCatalogOptionsDTO,
  EditorialBlockAdminDTO,
  EditorialBlockItemPublicDTO,
  EditorialBlockPublicDTO,
  EditorialResolvedBookDTO,
  EditorialResolvedSeriesDTO,
  ReplaceEditorialBlockItemsDTO,
  UpdateEditorialBlockDTO,
  UpsertEditorialBlockItemDTO,
} from "../../dto/editorial.dto.js";
import { ApiError } from "../../utils/api-error.js";
import { normalizeOptionalText } from "../../utils/normalize.js";
import { BookModel } from "../books/book.model.js";
import {
  EditorialBlockModel,
  type EditorialBlockDocument,
} from "./editorial.model.js";

const DEFAULT_SCOPE = "library";

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value === undefined) {
    return null;
  }

  if (value === null || value.trim() === "") {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, "editorial_invalid_date");
  }

  return date;
}

function isInWindow(now: Date, startsAt?: Date | null, endsAt?: Date | null): boolean {
  if (startsAt && startsAt.getTime() > now.getTime()) {
    return false;
  }

  if (endsAt && endsAt.getTime() < now.getTime()) {
    return false;
  }

  return true;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}

function toIsoOrNull(value?: Date | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function validateItemInput(item: UpsertEditorialBlockItemDTO): void {
  if (item.itemType !== "book" && item.itemType !== "series") {
    throw new ApiError(400, "editorial_item_type_invalid");
  }

  if (!item.target || !item.target.trim()) {
    throw new ApiError(400, "editorial_item_target_required");
  }

  if (item.itemType === "book" && !mongoose.Types.ObjectId.isValid(item.target.trim())) {
    throw new ApiError(400, "editorial_item_book_id_invalid");
  }
}

function toAdminDTO(block: EditorialBlockDocument): EditorialBlockAdminDTO {
  return {
    id: String(block._id),
    slug: block.slug,
    scope: block.scope,
    title: block.title,
    subtitle: block.subtitle ?? null,
    displayType: block.displayType,
    theme: block.theme ?? null,
    isActive: block.isActive,
    startsAt: toIsoOrNull(block.startsAt),
    endsAt: toIsoOrNull(block.endsAt),
    sortOrder: block.sortOrder,
    maxItems: block.maxItems,
    items: (block.items ?? [])
      .map((item) => ({
        id: String(item._id),
        itemType: item.itemType,
        target: item.target,
        position: item.position,
        badge: item.badge ?? null,
        kicker: item.kicker ?? null,
        customTitle: item.customTitle ?? null,
        customImage: item.customImage ?? null,
        startsAt: toIsoOrNull(item.startsAt),
        endsAt: toIsoOrNull(item.endsAt),
        isActive: item.isActive,
      }))
      .sort((left, right) => left.position - right.position),
    createdAt: block.createdAt ? new Date(block.createdAt).toISOString() : undefined,
    updatedAt: block.updatedAt ? new Date(block.updatedAt).toISOString() : undefined,
  };
}

async function resolveBookEntity(bookId: string): Promise<EditorialResolvedBookDTO | null> {
  const book = await BookModel.findById(bookId);
  if (!book) {
    return null;
  }

  return {
    type: "book",
    id: String(book._id),
    title: book.title,
    author: book.author,
    series: book.series ?? null,
    coverPath: book.coverPath ?? null,
  };
}

async function resolveSeriesEntity(seriesName: string): Promise<EditorialResolvedSeriesDTO | null> {
  const normalizedSeriesName = normalizeOptionalText(seriesName);
  if (!normalizedSeriesName) {
    return null;
  }

  const seriesExactRegex = new RegExp(`^\\s*${escapeRegex(normalizedSeriesName)}\\s*$`, "i");
  let books = await BookModel.find({ series: seriesExactRegex })
    .sort({ seriesIndex: 1, title: 1 })
    .limit(24);

  // Admin targets may use shorthand names; fallback to a contains match and
  // pick the most populated matching series so featured rows stay resilient.
  if (books.length === 0) {
    const seriesContainsRegex = new RegExp(escapeRegex(normalizedSeriesName), "i");
    const candidates = await BookModel.find({ series: seriesContainsRegex })
      .sort({ updatedAt: -1, seriesIndex: 1, title: 1 })
      .limit(120);

    const grouped = new Map<string, typeof candidates>();
    for (const book of candidates) {
      const key = normalizeOptionalText(book.series) ?? "";
      if (!key) {
        continue;
      }

      const current = grouped.get(key) ?? [];
      current.push(book);
      grouped.set(key, current);
    }

    const bestGroup = Array.from(grouped.values())
      .sort((left, right) => right.length - left.length)[0];

    if (bestGroup && bestGroup.length > 0) {
      books = [...bestGroup]
        .sort((left, right) => {
          const leftIndex = left.seriesIndex ?? Number.MAX_SAFE_INTEGER;
          const rightIndex = right.seriesIndex ?? Number.MAX_SAFE_INTEGER;
          if (leftIndex !== rightIndex) {
            return leftIndex - rightIndex;
          }

          return left.title.localeCompare(right.title);
        })
        .slice(0, 24);
    }
  }

  if (books.length === 0) {
    return null;
  }

  return {
    type: "series",
    name: books[0].series ?? normalizedSeriesName,
    bookCount: books.length,
    previewBooks: books.slice(0, 3).map((book) => ({
      id: String(book._id),
      title: book.title,
      coverPath: book.coverPath ?? null,
    })),
  };
}

async function resolvePublicItem(
  item: EditorialBlockDocument["items"][number],
): Promise<EditorialBlockItemPublicDTO | null> {
  if (item.itemType === "book") {
    const entity = await resolveBookEntity(item.target);
    if (!entity) {
      return null;
    }

    return {
      id: String(item._id),
      itemType: item.itemType,
      target: item.target,
      position: item.position,
      badge: item.badge ?? null,
      kicker: item.kicker ?? null,
      title: item.customTitle ?? entity.title,
      image: item.customImage ?? entity.coverPath ?? null,
      entity,
    };
  }

  const entity = await resolveSeriesEntity(item.target);
  if (!entity) {
    return null;
  }

  return {
    id: String(item._id),
    itemType: item.itemType,
    target: item.target,
    position: item.position,
    badge: item.badge ?? null,
    kicker: item.kicker ?? null,
    title: item.customTitle ?? entity.name,
    image: item.customImage ?? entity.previewBooks[0]?.coverPath ?? null,
    entity,
  };
}

export class EditorialService {
  static async listCatalogOptions(): Promise<EditorialCatalogOptionsDTO> {
    const [seriesAgg, books] = await Promise.all([
      BookModel.aggregate<{ _id: string; bookCount: number }>([
        {
          $match: {
            series: { $exists: true, $nin: [null, ""] },
          },
        },
        {
          $group: {
            _id: "$series",
            bookCount: { $sum: 1 },
          },
        },
        {
          $sort: {
            bookCount: -1,
            _id: 1,
          },
        },
        {
          $limit: 400,
        },
      ]),
      BookModel.find({})
        .sort({ updatedAt: -1, title: 1 })
        .limit(1200),
    ]);

    return {
      series: seriesAgg
        .map((entry) => ({
          name: entry._id,
          bookCount: entry.bookCount,
        }))
        .filter((entry) => !!normalizeOptionalText(entry.name)),
      books: books.map((book) => ({
        id: String(book._id),
        title: book.title,
        author: book.author,
        series: book.series ?? null,
      })),
    };
  }

  static async listAdminBlocks(): Promise<{ blocks: EditorialBlockAdminDTO[] }> {
    const blocks = await EditorialBlockModel.find({}).sort({ sortOrder: 1, updatedAt: -1 });
    return {
      blocks: blocks.map(toAdminDTO),
    };
  }

  static async createBlock(payload: CreateEditorialBlockDTO): Promise<EditorialBlockAdminDTO> {
    const slug = normalizeSlug(payload.slug ?? "");
    if (!slug) {
      throw new ApiError(400, "editorial_slug_required");
    }

    if (!payload.title || !payload.title.trim()) {
      throw new ApiError(400, "editorial_title_required");
    }

    const block = await EditorialBlockModel.create({
      slug,
      scope: payload.scope ?? DEFAULT_SCOPE,
      title: payload.title.trim(),
      subtitle: normalizeOptionalText(payload.subtitle),
      displayType: payload.displayType ?? "fan_cards",
      theme: normalizeOptionalText(payload.theme),
      isActive: payload.isActive ?? true,
      startsAt: parseOptionalDate(payload.startsAt),
      endsAt: parseOptionalDate(payload.endsAt),
      sortOrder: payload.sortOrder ?? 0,
      maxItems: payload.maxItems ?? 8,
      items: [],
    });

    return toAdminDTO(block);
  }

  static async updateBlock(
    blockId: string,
    payload: UpdateEditorialBlockDTO,
  ): Promise<EditorialBlockAdminDTO> {
    if (!mongoose.Types.ObjectId.isValid(blockId)) {
      throw new ApiError(400, "editorial_block_invalid_id");
    }

    const updates: Record<string, unknown> = {};

    if (payload.slug !== undefined) {
      const slug = normalizeSlug(payload.slug);
      if (!slug) {
        throw new ApiError(400, "editorial_slug_required");
      }
      updates.slug = slug;
    }

    if (payload.scope !== undefined) {
      updates.scope = payload.scope;
    }

    if (payload.title !== undefined) {
      if (!payload.title.trim()) {
        throw new ApiError(400, "editorial_title_required");
      }
      updates.title = payload.title.trim();
    }

    if (payload.subtitle !== undefined) {
      updates.subtitle = normalizeOptionalText(payload.subtitle);
    }

    if (payload.displayType !== undefined) {
      updates.displayType = payload.displayType;
    }

    if (payload.theme !== undefined) {
      updates.theme = normalizeOptionalText(payload.theme);
    }

    if (payload.isActive !== undefined) {
      updates.isActive = payload.isActive;
    }

    if (payload.startsAt !== undefined) {
      updates.startsAt = parseOptionalDate(payload.startsAt);
    }

    if (payload.endsAt !== undefined) {
      updates.endsAt = parseOptionalDate(payload.endsAt);
    }

    if (payload.sortOrder !== undefined) {
      updates.sortOrder = payload.sortOrder;
    }

    if (payload.maxItems !== undefined) {
      updates.maxItems = payload.maxItems;
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, "editorial_empty_update");
    }

    updates.updatedAt = new Date();

    const block = await EditorialBlockModel.findByIdAndUpdate(
      blockId,
      { $set: updates },
      { returnDocument: "after" },
    );

    if (!block) {
      throw new ApiError(404, "editorial_block_not_found");
    }

    return toAdminDTO(block);
  }

  static async deleteBlock(blockId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(blockId)) {
      throw new ApiError(400, "editorial_block_invalid_id");
    }

    const result = await EditorialBlockModel.deleteOne({ _id: blockId });
    if (result.deletedCount === 0) {
      throw new ApiError(404, "editorial_block_not_found");
    }
  }

  static async replaceBlockItems(
    blockId: string,
    payload: ReplaceEditorialBlockItemsDTO,
  ): Promise<EditorialBlockAdminDTO> {
    if (!mongoose.Types.ObjectId.isValid(blockId)) {
      throw new ApiError(400, "editorial_block_invalid_id");
    }

    if (!Array.isArray(payload.items)) {
      throw new ApiError(400, "editorial_items_invalid");
    }

    const normalizedItems = payload.items.map((item, index) => {
      validateItemInput(item);

      return {
        _id: item.id && mongoose.Types.ObjectId.isValid(item.id) ? new mongoose.Types.ObjectId(item.id) : new mongoose.Types.ObjectId(),
        itemType: item.itemType,
        target: item.target.trim(),
        position: item.position ?? index,
        badge: normalizeOptionalText(item.badge),
        kicker: normalizeOptionalText(item.kicker),
        customTitle: normalizeOptionalText(item.customTitle),
        customImage: normalizeOptionalText(item.customImage),
        startsAt: parseOptionalDate(item.startsAt),
        endsAt: parseOptionalDate(item.endsAt),
        isActive: item.isActive ?? true,
      };
    });

    const block = await EditorialBlockModel.findByIdAndUpdate(
      blockId,
      {
        $set: {
          items: normalizedItems,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );

    if (!block) {
      throw new ApiError(404, "editorial_block_not_found");
    }

    return toAdminDTO(block);
  }

  static async listActiveBlocks(scope: string): Promise<{ blocks: EditorialBlockPublicDTO[] }> {
    const now = new Date();

    const blocks = await EditorialBlockModel.find({
      scope,
      isActive: true,
      $or: [{ startsAt: null }, { startsAt: { $lte: now } }],
      $and: [{ $or: [{ endsAt: null }, { endsAt: { $gte: now } }] }],
    }).sort({ sortOrder: 1, updatedAt: -1 });

    const publicBlocks: EditorialBlockPublicDTO[] = [];

    for (const block of blocks) {
      const activeItems = (block.items ?? [])
        .filter((item) => item.isActive)
        .filter((item) => isInWindow(now, item.startsAt, item.endsAt))
        .sort((left, right) => left.position - right.position)
        .slice(0, block.maxItems);

      const resolvedItems: EditorialBlockItemPublicDTO[] = [];
      for (const item of activeItems) {
        const resolved = await resolvePublicItem(item);
        if (resolved) {
          resolvedItems.push(resolved);
        }
      }

      if (resolvedItems.length === 0) {
        continue;
      }

      publicBlocks.push({
        id: String(block._id),
        slug: block.slug,
        scope: block.scope,
        title: block.title,
        subtitle: block.subtitle ?? null,
        displayType: block.displayType,
        theme: block.theme ?? null,
        items: resolvedItems,
      });
    }

    return { blocks: publicBlocks };
  }
}
