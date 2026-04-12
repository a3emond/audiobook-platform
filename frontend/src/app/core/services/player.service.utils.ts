/**
 * ============================================================
 * player.service.utils.ts
 * ============================================================
 *
 * Pure helper functions for PlayerService. Keeps chapter math and
 * stream-URL assembly separate from service orchestration so they
 * can be unit-tested independently.
 *
 * Functions:
 *   streamUrlForBook(bookId, token)           — build authenticated audio stream URL
 *   chapterStartSeconds(chapter)              — chapter.start as seconds
 *   chapterEndSeconds(chapter)                — chapter.end as seconds
 *   currentChapterIndex(chapters, current)    — index of chapter at a given position
 *   normalizeChapters(chapters, duration)     — convert ms → s, fill gaps, sort
 * ============================================================
 */
import type { Chapter } from '../models/api.models';

// Player service utilities: isolate chapter math and URL assembly from service orchestration.
export function streamUrlForBook(bookId: string, token: string | null): string {
  const base = `/streaming/books/${bookId}/audio`;
  if (!token) {
    return base;
  }

  return `${base}?access_token=${encodeURIComponent(token)}`;
}

export function chapterStartSeconds(chapter: Chapter): number {
  return chapter.start;
}

export function chapterEndSeconds(chapter: Chapter): number {
  return chapter.end;
}

export function currentChapterIndex(chapters: Chapter[], current: number): number {
  if (chapters.length === 0) {
    return 0;
  }

  for (let index = 0; index < chapters.length; index += 1) {
    const chapter = chapters[index];
    const start = chapterStartSeconds(chapter);
    const end = chapterEndSeconds(chapter);
    const isLast = index === chapters.length - 1;
    if (current >= start && (isLast ? current <= end : current < end)) {
      return index;
    }
  }

  return chapters.length - 1;
}

export function normalizeChapters(chapters: Chapter[], durationSeconds: number): Chapter[] {
  if (chapters.length === 0) {
    return [];
  }

  const normalized = chapters
    .map((chapter) => ({
      ...chapter,
      start: Math.max(0, Math.floor(chapter.start / 1000)),
      end: Math.max(0, Math.floor(chapter.end / 1000)),
    }))
    .sort((a, b) => a.index - b.index || a.start - b.start);

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    const next = normalized[index + 1];
    const fallbackEnd = next
      ? Math.max(current.start + 1, next.start)
      : Math.max(current.start + 1, durationSeconds || current.start + 1);
    if (current.end <= current.start) {
      current.end = fallbackEnd;
    }
  }

  return normalized;
}