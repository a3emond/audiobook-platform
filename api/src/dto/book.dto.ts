import { IdDTO, TimestampDTO } from "./common.dto.js";

export interface ChapterDTO {
  index: number;
  title: string;
  start: number;
  end: number;
}

export interface LocalizedTextDTO {
  default?: string | null;
  fr?: string | null;
  en?: string | null;
}

export interface BookDTO extends IdDTO, TimestampDTO {
  filePath: string;
  checksum: string;

  title: string;
  author: string;
  series?: string | null;
  seriesIndex?: number | null;
  duration: number;
  language?: string | null;

  chapters: ChapterDTO[];
  coverPath?: string | null;

  tags: string[];
  genre?: string | null;

  description: LocalizedTextDTO;

  overrides: {
    title: boolean;
    author: boolean;
    series: boolean;
    seriesIndex: boolean;
    chapters: boolean;
    cover: boolean;
    description: boolean;
  };

  fileSync: {
    status: "in_sync" | "dirty" | "writing" | "error";
    lastReadAt?: string | null;
    lastWriteAt?: string | null;
  };

  version: number;
  lastScannedAt: string;
  processingState: "ready" | "pending_sanitize" | "sanitizing" | "sanitize_failed";
}

export interface UpdateBookMetadataDTO {
  title?: string;
  author?: string;
  series?: string | null;
  seriesIndex?: number | null;
  language?: "en" | "fr";
  genre?: string | null;
  tags?: string[];
  description?: LocalizedTextDTO;
}

export interface UpdateChaptersDTO {
  chapters: ChapterDTO[];
}

// Book list orderings. "recent" (date added) is the default so background
// worker writes, which bump updatedAt, never reshuffle the catalog.
export const BOOK_SORTS = [
  "recent",
  "oldest",
  "title",
  "author",
  "series",
  "duration",
  "duration_desc",
  "updated",
] as const;
export type BookSort = (typeof BOOK_SORTS)[number];

export const SERIES_SORTS = ["activity", "recent", "relevance", "alphabetical"] as const;
export type SeriesSort = (typeof SERIES_SORTS)[number];

// Metadata gaps an admin can filter on.
export const BOOK_MISSING_FIELDS = ["cover", "description", "series", "genre", "tags"] as const;
export type BookMissingField = (typeof BOOK_MISSING_FIELDS)[number];

// Health problems an admin can filter on.
export const BOOK_HEALTH_FILTERS = ["sync_error", "dirty", "processing", "sanitize_failed"] as const;
export type BookHealthFilter = (typeof BOOK_HEALTH_FILTERS)[number];

export interface ListBooksQueryDTO {
  q?: string;
  title?: string;
  author?: string;
  series?: string;
  tags?: string | string[];
  genre?: string;
  language?: string;
  sort?: BookSort | SeriesSort;
  missing?: BookMissingField[];
  health?: BookHealthFilter;
  minDuration?: number;
  maxDuration?: number;
  limit?: number;
  offset?: number;
}

export interface FacetCountDTO {
  value: string;
  count: number;
}

export interface BookFacetsDTO {
  total: number;
  genres: FacetCountDTO[];
  tags: FacetCountDTO[];
  authors: FacetCountDTO[];
  series: FacetCountDTO[];
  languages: FacetCountDTO[];
  missing: Record<BookMissingField, number>;
  health: Record<BookHealthFilter, number>;
}

export interface BulkBookUpdateDTO {
  bookIds: string[];
  action: "update" | "delete";
  changes?: {
    series?: string | null;
    genre?: string | null;
    language?: "en" | "fr";
    author?: string;
    addTags?: string[];
    removeTags?: string[];
  };
}

export interface BulkBookResultDTO {
  succeeded: string[];
  failed: Array<{ bookId: string; error: string }>;
  jobIds: string[];
}

export interface AiMetadataSuggestionDTO {
  title: string | null;
  author: string | null;
  series: string | null;
  seriesIndex: number | null;
  genre: string | null;
  language: "en" | "fr" | null;
  tags: string[];
  description: string | null;
  confidence: "high" | "medium" | "low";
  notes: string | null;
  sources: Array<{ title: string; url: string }>;
}
