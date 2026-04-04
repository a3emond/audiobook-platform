import { IdDTO } from "./common.dto.js";

export interface JobDTO extends IdDTO {
  type:
    | "INGEST"
    | "RESCAN"
    | "WRITE_METADATA"
    | "EXTRACT_COVER"
    | "DELETE_BOOK"
    | "REPLACE_FILE";
  status: "queued" | "running" | "done" | "failed";

  payload: unknown;
  error?: unknown;

  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}
