import type { Book } from '../../../core/models/api.models';
import type { UpdateBookMetadataPayload } from '../../../core/services/admin.types';
import type { EditableChapter } from './admin-edit-page.types';

// Admin edit page helpers: keep chapter validation and payload shaping outside the component class.
export function buildMetadataPayload(values: {
  title: string;
  author: string;
  series: string;
  seriesIndex: number | null;
  language: 'en' | 'fr';
  genre: string;
  tagsRaw: string;
  descriptionDefault: string;
}): UpdateBookMetadataPayload {
  return {
    title: values.title.trim() || undefined,
    author: values.author.trim() || undefined,
    series: values.series.trim() || null,
    seriesIndex: values.seriesIndex,
    language: values.language,
    genre: values.genre.trim() || null,
    tags: values.tagsRaw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    description: {
      default: values.descriptionDefault.trim() || null,
    },
  };
}

export function hydrateEditableChapters(
  chapters: Book['chapters'] | undefined,
  nextId: () => number,
): EditableChapter[] {
  const rows = (chapters ?? []).map((chapter) => ({
    id: nextId(),
    title: chapter.title,
    start: chapter.start,
    end: chapter.end,
  }));

  if (rows.length > 0) {
    return rows;
  }

  return [
    {
      id: nextId(),
      title: 'Chapter 1',
      start: 0,
      end: 0,
    },
  ];
}

export function nextChapterRow(existingRows: EditableChapter[], nextId: () => number): EditableChapter {
  const lastEnd = existingRows.length > 0 ? Number(existingRows[existingRows.length - 1].end) : 0;
  const safeEnd = Number.isFinite(lastEnd) ? lastEnd : 0;
  return {
    id: nextId(),
    title: `Chapter ${existingRows.length + 1}`,
    start: safeEnd,
    end: safeEnd,
  };
}

export function validateChapterRows(chapterRows: EditableChapter[]): string | null {
  if (chapterRows.length === 0) {
    return 'At least one chapter is required';
  }

  for (let index = 0; index < chapterRows.length; index += 1) {
    const chapter = chapterRows[index];
    const title = chapter.title.trim();
    const start = Number(chapter.start);
    const end = Number(chapter.end);

    if (!title) {
      return `Chapter ${index + 1} requires a title`;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return `Chapter ${index + 1} must have valid numeric start/end values`;
    }
    if (start < 0 || end < 0) {
      return `Chapter ${index + 1} start/end must be non-negative`;
    }
    if (end < start) {
      return `Chapter ${index + 1} end must be greater than or equal to start`;
    }

    if (index > 0) {
      const prevEnd = Number(chapterRows[index - 1].end);
      if (start < prevEnd) {
        return `Chapter ${index + 1} start must be >= previous chapter end`;
      }
    }
  }

  return null;
}