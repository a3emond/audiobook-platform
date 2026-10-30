import type { Book } from '../../../core/models/api.models';
import type { AiMetadataSuggestion, UpdateBookMetadataPayload } from '../../../core/services/admin.types';
import type { AiFieldKey, AiFieldRow, EditableChapter, MetadataFormValues } from './admin-edit-page.types';

// Admin edit page helpers: keep chapter validation and payload shaping outside the component class.
export function buildMetadataPayload(values: MetadataFormValues): UpdateBookMetadataPayload {
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

const AI_FIELD_LABELS: Record<AiFieldKey, string> = {
  title: 'Title',
  author: 'Author',
  series: 'Series',
  seriesIndex: 'Series #',
  genre: 'Genre',
  language: 'Language',
  tags: 'Tags',
  description: 'Description',
};

function formValueFor(key: AiFieldKey, values: MetadataFormValues): string {
  switch (key) {
    case 'seriesIndex':
      return values.seriesIndex === null || values.seriesIndex === undefined ? '' : String(values.seriesIndex);
    case 'tags':
      return values.tagsRaw.trim();
    case 'description':
      return values.descriptionDefault.trim();
    default:
      return String(values[key] ?? '').trim();
  }
}

function suggestedValueFor(key: AiFieldKey, suggestion: AiMetadataSuggestion): string {
  switch (key) {
    case 'seriesIndex':
      return suggestion.seriesIndex === null ? '' : String(suggestion.seriesIndex);
    case 'tags':
      return suggestion.tags.join(', ');
    default:
      return (suggestion[key] ?? '').toString().trim();
  }
}

const sameText = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

// Only fields where the AI found something different become rows. Empty form
// fields are pre-selected; overwriting existing values is opt-in unless the AI
// is highly confident. Tags merge with existing tags rather than replacing them.
export function buildAiFieldRows(values: MetadataFormValues, suggestion: AiMetadataSuggestion): AiFieldRow[] {
  const rows: AiFieldRow[] = [];

  for (const key of Object.keys(AI_FIELD_LABELS) as AiFieldKey[]) {
    const current = formValueFor(key, values);
    let suggested = suggestedValueFor(key, suggestion);
    if (!suggested) {
      continue;
    }

    if (key === 'tags') {
      const existing = current.split(',').map((tag) => tag.trim()).filter(Boolean);
      const known = new Set(existing.map((tag) => tag.toLowerCase()));
      const additions = suggestion.tags.filter((tag) => !known.has(tag.toLowerCase()));
      if (additions.length === 0) {
        continue;
      }
      suggested = [...existing, ...additions].join(', ');
    }

    if (sameText(current, suggested)) {
      continue;
    }

    rows.push({
      key,
      label: AI_FIELD_LABELS[key],
      current,
      suggested,
      selected: !current || key === 'tags' || suggestion.confidence === 'high',
    });
  }

  return rows;
}

export function applyAiRows(values: MetadataFormValues, rows: AiFieldRow[]): MetadataFormValues {
  const next = { ...values };

  for (const row of rows.filter((item) => item.selected)) {
    switch (row.key) {
      case 'seriesIndex': {
        const parsed = Number(row.suggested);
        next.seriesIndex = Number.isFinite(parsed) ? parsed : next.seriesIndex;
        break;
      }
      case 'language':
        next.language = row.suggested === 'fr' ? 'fr' : 'en';
        break;
      case 'tags':
        next.tagsRaw = row.suggested;
        break;
      case 'description':
        next.descriptionDefault = row.suggested;
        break;
      default:
        next[row.key] = row.suggested;
    }
  }

  return next;
}
