import { TimestampDTO } from "./common.dto.js";

export interface ProgressDTO extends TimestampDTO {
  bookId: string;

  positionSeconds: number;
  durationAtSave: number;

  lastChapterIndex?: number | null;
  secondsIntoChapter?: number | null;

  completed: boolean;
  completedAt?: string | null;
  manualCompletion: boolean;

  lastListenedAt?: string | null;
}

export interface SaveProgressDTO {
  positionSeconds: number;
  durationAtSave: number;
  lastChapterIndex?: number;
  secondsIntoChapter?: number;
}

export interface CompleteDTO {
  manual?: boolean;
}
