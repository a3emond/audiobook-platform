import { IdDTO } from "./common.dto.js";

export interface IngestJobOutputDTO {
  bookId: string;
  filePath: string;
  coverPath: string | null;
  checksum: string;
  duration: number;
  title: string;
  author: string;
  chapters: number;
}

export interface IngestMp3AsM4BJobOutputDTO {
  bookId: string;
  filePath: string;
  coverPath: string | null;
  checksum: string;
  duration: number;
  title: string;
  author: string;
  processingState: "pending_sanitize";
}

export interface SanitizeMp3ToM4BJobOutputDTO {
  bookId: string;
  filePath: string;
  checksum: string;
  duration: number;
}

export interface RescanJobOutputDTO {
  force: boolean;
  targetCount: number;
  scanned: number;
  updated: number;
  missing: number;
  errors: number;
}

export interface WriteMetadataJobOutputDTO {
  bookId: string;
  filePath: string;
  title: string;
  author: string;
  series: string | null;
  genre: string | null;
  chapters: number;
}

export interface ExtractCoverJobOutputDTO {
  bookId: string;
  coverPath: string | null;
  skipped: boolean;
  reason?: string;
}

export interface ReplaceCoverJobOutputDTO {
  bookId: string;
  filePath: string;
  coverPath: string | null;
}

export interface DeleteBookJobOutputDTO {
  bookId: string;
  deleted: boolean;
  filesDeleted: boolean;
}

export interface ReplaceFileJobOutputDTO {
  bookId: string;
  filePath: string;
  sourcePath: string;
  checksum: string;
  duration: number;
  chapters: number;
  coverPath: string | null;
}

export type JobOutputDTO =
  | IngestJobOutputDTO
  | IngestMp3AsM4BJobOutputDTO
  | SanitizeMp3ToM4BJobOutputDTO
  | RescanJobOutputDTO
  | WriteMetadataJobOutputDTO
  | ExtractCoverJobOutputDTO
  | ReplaceCoverJobOutputDTO
  | DeleteBookJobOutputDTO
  | ReplaceFileJobOutputDTO;

export type JobTypeDTO =
  | "INGEST"
  | "INGEST_MP3_AS_M4B"
  | "SANITIZE_MP3_TO_M4B"
  | "RESCAN"
  | "WRITE_METADATA"
  | "EXTRACT_COVER"
  | "REPLACE_COVER"
  | "DELETE_BOOK"
  | "REPLACE_FILE";

export type JobStatusDTO =
  | "queued"
  | "running"
  | "retrying"
  | "done"
  | "failed";

export interface JobOutputByTypeDTO {
  INGEST: IngestJobOutputDTO;
  INGEST_MP3_AS_M4B: IngestMp3AsM4BJobOutputDTO;
  SANITIZE_MP3_TO_M4B: SanitizeMp3ToM4BJobOutputDTO;
  RESCAN: RescanJobOutputDTO;
  WRITE_METADATA: WriteMetadataJobOutputDTO;
  EXTRACT_COVER: ExtractCoverJobOutputDTO;
  REPLACE_COVER: ReplaceCoverJobOutputDTO;
  DELETE_BOOK: DeleteBookJobOutputDTO;
  REPLACE_FILE: ReplaceFileJobOutputDTO;
}

export type JobDTOByType<T extends JobTypeDTO> = Omit<JobDTO, "type" | "output"> & {
  type: T;
  output?: JobOutputByTypeDTO[T] | null;
};

export type TypedJobDTO = {
  [T in JobTypeDTO]: JobDTOByType<T>;
}[JobTypeDTO];

export interface JobDTO extends IdDTO {
  type: JobTypeDTO;
  status: JobStatusDTO;

  payload: unknown;
  output?: JobOutputDTO | null;
  error?: unknown;
  attempt: number;
  maxAttempts: number;
  priority: number;
  runAfter?: string | null;

  createdAt: string;
  updatedAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}
