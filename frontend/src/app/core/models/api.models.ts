export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface UserProfile {
  displayName: string | null;
  preferredLocale: 'fr' | 'en';
}

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  profile: UserProfile;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  displayName?: string;
  preferredLocale?: 'fr' | 'en';
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface ChangeEmailPayload {
  currentPassword: string;
  newEmail: string;
}

export type OAuthProvider = 'google' | 'apple';

export interface Chapter {
  index: number;
  title: string;
  start: number;
  end: number;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  duration: number;
  version?: number;
  updatedAt?: string;
  language?: 'fr' | 'en' | string | null;
  coverPath?: string | null;
  series?: string | null;
  seriesIndex?: number | null;
  genre?: string | null;
  tags?: string[];
  description?: {
    default?: string | null;
    fr?: string | null;
    en?: string | null;
  };
  chapters: Chapter[];
}

export interface ListBooksResponse extends PaginationMeta {
  books: Book[];
}

export interface Progress {
  bookId: string;
  positionSeconds: number;
  durationAtSave: number;
  completed: boolean;
  lastListenedAt: string | null;
}

export interface ResumeInfo {
  bookId: string;
  streamPath: string;
  positionSeconds: number;
  startSeconds: number;
  durationSeconds: number;
  canResume: boolean;
  appliedRewind: boolean;
}

export interface UserSettings {
  locale: 'fr' | 'en';
  player: {
    forwardJumpSeconds: number;
    backwardJumpSeconds: number;
    resumeRewind: {
      enabled: boolean;
      thresholdSinceLastListenSeconds: number;
      rewindSeconds: number;
    };
    playbackRate: number;
    autoMarkCompletedThresholdSeconds: number;
    sleepTimerMode: 'off' | '15m' | '30m' | '45m' | '60m' | 'chapter';
  };
  library: {
    showCompleted: boolean;
  };
}

export interface UpdateSettingsPayload {
  locale?: 'fr' | 'en';
  player?: Partial<UserSettings['player']> & {
    resumeRewind?: Partial<UserSettings['player']['resumeRewind']>;
  };
  library?: { showCompleted?: boolean };
}

export interface ListeningSession {
  id: string;
  bookId: string;
  startedAt: string;
  endedAt: string;
  listenedSeconds: number;
  startPositionSeconds: number;
  endPositionSeconds: number;
  device: 'web' | 'ios' | 'android' | 'desktop' | 'unknown';
}

export interface ListListeningSessionsResponse extends PaginationMeta {
  sessions: ListeningSession[];
}

export interface CreateListeningSessionPayload {
  bookId: string;
  startedAt: string;
  endedAt: string;
  listenedSeconds: number;
  startPositionSeconds: number;
  endPositionSeconds: number;
  device?: 'web' | 'ios' | 'android' | 'desktop' | 'unknown';
}

export interface SeriesSummary {
  id: string;
  name: string;
  bookCount: number;
  totalDuration: number;
  authors: string[];
  genres: string[];
  tags: string[];
  matchedTags?: string[];
  relevanceScore?: number;
  lastUpdatedAt?: string;
  coverPath?: string | null;
}

export interface SeriesDetail extends SeriesSummary {
  books: Book[];
}

export interface ListSeriesResponse extends PaginationMeta {
  series: SeriesSummary[];
}

export interface Collection {
  id: string;
  name: string;
  bookIds: string[];
  cover?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListCollectionsResponse extends PaginationMeta {
  collections: Collection[];
}

export type EditorialItemType = 'series' | 'book';

export interface EditorialResolvedBook {
  type: 'book';
  id: string;
  title: string;
  author: string;
  version?: number;
  updatedAt?: string;
  series?: string | null;
  coverPath?: string | null;
}

export interface EditorialResolvedSeries {
  type: 'series';
  name: string;
  bookCount: number;
  previewBooks: Array<{
    id: string;
    title: string;
    version?: number;
    updatedAt?: string;
    coverPath?: string | null;
  }>;
}

export interface EditorialBlockItem {
  id: string;
  itemType: EditorialItemType;
  target: string;
  position: number;
  badge?: string | null;
  kicker?: string | null;
  title?: string | null;
  image?: string | null;
  entity: EditorialResolvedBook | EditorialResolvedSeries;
}

export interface EditorialBlock {
  id: string;
  slug: string;
  scope: 'library';
  title: string;
  subtitle?: string | null;
  displayType: 'fan_cards';
  theme?: string | null;
  items: EditorialBlockItem[];
}

export interface ListEditorialBlocksResponse {
  blocks: EditorialBlock[];
}

export type DiscussionLanguage = 'fr' | 'en';
export type DiscussionChannelKey = string;

export interface DiscussionChannel {
  key: DiscussionChannelKey;
  lang: DiscussionLanguage;
  title: string;
  description: string;
  isDefault?: boolean;
}

export interface DiscussionMessage {
  id: string;
  channelKey: DiscussionChannelKey;
  lang: DiscussionLanguage;
  body: string;
  author: {
    id: string;
    displayName: string;
    isAdmin: boolean;
  };
  replyToMessageId?: string;
  replyTo?: {
    id: string;
    authorDisplayName: string;
    bodyPreview: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface ListDiscussionMessagesResponse {
  messages: DiscussionMessage[];
  hasMore: boolean;
}

export interface RealtimeEventEnvelope<T = unknown> {
  type: string;
  ts: string;
  payload: T;
}
