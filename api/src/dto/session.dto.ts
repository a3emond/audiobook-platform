import { IdDTO, PaginationMetaDTO } from "./common.dto.js";

export interface ListeningSessionDTO extends IdDTO {
  bookId: string;

  startedAt: string;
  endedAt: string;

  listenedSeconds: number;

  startPositionSeconds: number;
  endPositionSeconds: number;

  device: "web" | "ios" | "android" | "desktop" | "unknown";
}

export interface CreateListeningSessionDTO {
  bookId: string;
  startedAt: string;
  endedAt: string;
  listenedSeconds: number;
  startPositionSeconds: number;
  endPositionSeconds: number;
  device?: "web" | "ios" | "android" | "desktop" | "unknown";
}

export interface ListListeningSessionsQueryDTO {
  bookId?: string;
  limit?: number;
  offset?: number;
}

export interface ListListeningSessionsResponseDTO extends PaginationMetaDTO {
  sessions: ListeningSessionDTO[];
  total: number;
}
