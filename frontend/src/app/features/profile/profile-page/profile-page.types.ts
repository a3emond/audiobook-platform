import type { Book } from '../../../core/models/api.models';

export interface HistoryBookRow {
  bookId: string;
  book: Book | null;
  sessions: number;
  totalListenedSeconds: number;
  averageSessionSeconds: number;
  lastListenedAt: string | null;
}

export interface ThresholdOption {
  label: string;
  seconds: number;
}

export type ProfileSection = 'account' | 'security' | 'stats' | 'history';

export interface ProfilePreferencesValues {
  displayName: string;
  preferredLocale: 'fr' | 'en';
  forwardJumpSeconds: number;
  backwardJumpSeconds: number;
  playbackRate: number;
  resumeRewindEnabled: boolean;
  rewindThresholdSeconds: number;
  rewindSeconds: number;
  showCompleted: boolean;
}
