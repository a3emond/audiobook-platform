import mongoose from "mongoose";

import type { JobDocument } from "../queue/job.types.js";
import { normalizeTagList } from "../utils/normalize.js";
import { JobLogger } from "../utils/job-logger.js";

interface SyncTagsJobPayload {
  trigger?: string;
}

interface BookRecord {
  _id: mongoose.Types.ObjectId;
  tags?: string[] | null;
  normalizedTags?: string[] | null;
}

function stableTagSet(values: unknown): string[] {
  return normalizeTagList(values).sort((left, right) => left.localeCompare(right));
}

function sameTags(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

export async function handleSyncTagsJob(job: JobDocument): Promise<Record<string, unknown>> {
  const logger = new JobLogger(String(job._id));
  const payload = (job.payload as SyncTagsJobPayload) || {};

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("db_not_connected");
  }

  const booksCollection = db.collection<BookRecord>("books");
  const books = await booksCollection
    .find({}, { projection: { _id: 1, tags: 1, normalizedTags: 1 } })
    .toArray();

  let updated = 0;
  let unchanged = 0;

  logger.info("Tag sync started", {
    trigger: payload.trigger || "manual",
    targetCount: books.length,
  });

  for (const book of books) {
    const merged = [
      ...((book.tags ?? []) as string[]),
      ...((book.normalizedTags ?? []) as string[]),
    ];

    const canonical = stableTagSet(merged);
    const currentTags = stableTagSet(book.tags ?? []);
    const currentNormalized = stableTagSet(book.normalizedTags ?? []);

    if (sameTags(canonical, currentTags) && sameTags(canonical, currentNormalized)) {
      unchanged += 1;
      continue;
    }

    await booksCollection.updateOne(
      { _id: book._id },
      {
        $set: {
          tags: canonical,
          normalizedTags: canonical,
          updatedAt: new Date(),
        },
      },
    );

    updated += 1;
  }

  logger.info("Tag sync completed", {
    scanned: books.length,
    updated,
    unchanged,
  });

  await logger.persist();

  return {
    scanned: books.length,
    updated,
    unchanged,
  };
}
