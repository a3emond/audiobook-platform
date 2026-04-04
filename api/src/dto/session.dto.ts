import { IdDTO } from "./common.dto.js";

export interface ListeningSessionDTO extends IdDTO {
  bookId: string;

  startedAt: string;
  endedAt: string;

  listenedSeconds: number;

  startPositionSeconds: number;
  endPositionSeconds: number;

  device: "web" | "ios" | "android" | "desktop" | "unknown";
}
