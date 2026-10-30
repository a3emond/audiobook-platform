export interface EditableChapter {
  id: number;
  title: string;
  start: number;
  end: number;
}
export interface MetadataFormValues {
  title: string;
  author: string;
  series: string;
  seriesIndex: number | null;
  language: 'en' | 'fr';
  genre: string;
  tagsRaw: string;
  descriptionDefault: string;
}

export type AiFieldKey = 'title' | 'author' | 'series' | 'seriesIndex' | 'genre' | 'language' | 'tags' | 'description';

// One reviewable AI suggestion: what the form has now vs what the AI found.
export interface AiFieldRow {
  key: AiFieldKey;
  label: string;
  current: string;
  suggested: string;
  selected: boolean;
}
