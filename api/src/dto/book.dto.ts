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

export interface ListBooksQueryDTO {
  q?: string;
  title?: string;
  author?: string;
  series?: string;
  tags?: string | string[];
  genre?: string;
  language?: string;
  sort?: "alphabetical" | "activity" | "relevance";
  limit?: number;
  offset?: number;
}
