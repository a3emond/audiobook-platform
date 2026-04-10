import type { Book, Chapter } from '../../../core/models/api.models';

import type { SleepTimerMode } from './player-page.types';

// Player page utilities: keep formatting and chapter/progress math outside the component class.
export function computeCoverUrl(book: Book, token: string | null): string {
  if (!book.coverPath || !token) {
    return '';
  }

  return `/streaming/books/${book.id}/cover?access_token=${encodeURIComponent(token)}`;
}

export function chapterStartSeconds(chapter: Chapter): number {
  return chapter.start;
}

export function chapterEndSeconds(chapter: Chapter): number {
  return chapter.end;
}

export function chapterDurationSeconds(chapter: Chapter): number {
  return Math.max(1, chapterEndSeconds(chapter) - chapterStartSeconds(chapter));
}

export function activeChapterIndexFromTime(chapters: Chapter[], current: number): number {
  if (chapters.length === 0) {
    return 0;
  }

  const index = chapters.findIndex((chapter, chapterIndex) => {
    const start = chapterStartSeconds(chapter);
    const end = chapterEndSeconds(chapter);
    const isLast = chapterIndex === chapters.length - 1;
    return current >= start && (isLast ? current <= end : current < end);
  });

  return index >= 0 ? index : chapters.length - 1;
}

export function resolveProgressInputTarget(
  mode: 'chapter' | 'book',
  inputValue: number,
  chapter: Chapter | null,
): number {
  if (mode === 'book' || !chapter) {
    return inputValue;
  }

  const start = chapterStartSeconds(chapter);
  const end = chapterEndSeconds(chapter);
  return Math.max(start, Math.min(start + inputValue, Math.max(start, end - 0.25)));
}

export function progressRangeMax(
  mode: 'chapter' | 'book',
  durationSeconds: number,
  chapter: Chapter | null,
): number {
  if (mode === 'book' || !chapter) {
    return Math.max(1, durationSeconds);
  }

  return Math.max(1, Math.floor(chapterDurationSeconds(chapter)));
}

export function progressSliderValue(
  mode: 'chapter' | 'book',
  currentSeconds: number,
  rangeMax: number,
  chapter: Chapter | null,
): number {
  if (mode === 'book' || !chapter) {
    return Math.max(0, Math.min(currentSeconds, rangeMax));
  }

  const offset = currentSeconds - chapterStartSeconds(chapter);
  return Math.max(0, Math.min(offset, rangeMax));
}

export function progressMin(mode: 'chapter' | 'book', chapter: Chapter | null): number {
  if (mode === 'book' || !chapter) {
    return 0;
  }

  return Math.floor(chapterStartSeconds(chapter));
}

export function progressMax(
  mode: 'chapter' | 'book',
  durationSeconds: number,
  chapter: Chapter | null,
  minimum: number,
): number {
  if (mode === 'book' || !chapter) {
    return Math.max(1, durationSeconds);
  }

  return Math.max(minimum + 1, Math.floor(chapterEndSeconds(chapter) - 0.001));
}

export function clampProgressValue(current: number, min: number, max: number): number {
  if (current < min) {
    return min;
  }

  if (current > max) {
    return max;
  }

  return current;
}

export function sleepTimerLabel(mode: SleepTimerMode): string {
  switch (mode) {
    case '15m':
      return '15 min';
    case '30m':
      return '30 min';
    case '45m':
      return '45 min';
    case '60m':
      return '1 h';
    case 'chapter':
      return 'End chapter';
    default:
      return 'Disabled';
  }
}

export function formatTime(totalSeconds: number): string {
  const value = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatLongDuration(totalSeconds: number): string {
  const value = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);

  if (hours <= 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
}

export function resolvedDescription(book: Book | null): string | null {
  const description = book?.description;
  if (!description) {
    return null;
  }

  return description.default?.trim() || description.en?.trim() || description.fr?.trim() || null;
}

export function coverInitials(title: string): string {
  const initials = title
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return initials || 'BK';
}

export function shouldHandlePlayerHotkey(target: HTMLElement | null): boolean {
  const tag = target?.tagName.toLowerCase();
  return !(tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable);
}