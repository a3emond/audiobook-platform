/**
 * ============================================================
 * admin-upload-queue.utils.ts
 * ============================================================
 *
 * Pure helper functions for AdminUploadQueueService. Keeps
 * immutable queue updates and job-tracking logic out of the
 * service class.
 *
 * Functions:
 *   createQueueItem(file, index)             — build a new UploadQueueItem from a File
 *   collectDroppedFiles(dataTransfer)        — expand dropped files/folders recursively
 *   selectAudiobookFiles(files, existing)    — keep audio files, pair folder covers, dedupe
 *   patchQueueItem(items, index, patch)      — immutably update one item by index
 *   patchQueueItemById(items, id, mutate)    — immutably update one item by id
 *   mergeTrackedJobs(current, jobs, ids)     — merge an incoming job list into the
 *                                              tracked-jobs record (ignores untracked)
 *   allTrackedJobsTerminal(ids, jobsById)    — true when every tracked job is done/failed
 * ============================================================
 */
import type { AdminJob } from './admin.types';
import type { UploadQueueItem } from './admin-upload-queue.service';

// Upload queue helpers: keep immutable queue updates and job tracking out of the service class.
export function createQueueItem(
  file: File,
  index: number,
  options: { relativePath?: string; coverFile?: File | null; language?: 'fr' | 'en'; folderAudioCount?: number } = {},
): UploadQueueItem {
  const type: UploadQueueItem['type'] = file.name.toLowerCase().endsWith('.mp3') ? 'mp3' : 'audio';
  const relativePath = options.relativePath || file.name;
  const id = `${Date.now()}-${index}-${relativePath}`;
  const base = {
    id,
    file,
    type,
    status: 'checking' as const,
    language: options.language ?? 'en',
    relativePath,
    folder: folderOf(relativePath),
    folderAudioCount: options.folderAudioCount ?? 1,
  };

  return type === 'mp3' ? { ...base, mp3: { coverFile: options.coverFile ?? null } } : base;
}

export const AUDIOBOOK_EXTENSIONS = ['.m4b', '.m4a', '.mp3', '.ogg', '.wav'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
// Preferred cover file names, best first.
const COVER_NAMES = ['cover', 'folder', 'front', 'poster', 'artwork'];

export interface PickedFile {
  file: File;
  relativePath: string;
}

export interface AudiobookSelection {
  books: Array<PickedFile & { coverFile: File | null; folderAudioCount: number }>;
  skipped: number;
  duplicates: number;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

export function folderOf(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/');
  return slash >= 0 ? relativePath.slice(0, slash) : '';
}

// Hidden files, macOS resource forks and archive metadata are never books.
function isJunk(relativePath: string): boolean {
  return relativePath.split('/').some((part) => part.startsWith('.') || part.startsWith('._') || part === '__MACOSX');
}

// Keeps only audiobook files, pairs each folder's cover image with its MP3s,
// and drops files already queued (same path and size).
export function selectAudiobookFiles(picked: PickedFile[], existing: Array<{ relativePath: string; file: File }>): AudiobookSelection {
  const known = new Set(existing.map((item) => `${item.relativePath}|${item.file.size}`));
  const audio: PickedFile[] = [];
  const imagesByFolder = new Map<string, PickedFile[]>();
  let skipped = 0;
  let duplicates = 0;

  for (const entry of picked) {
    const ext = extensionOf(entry.file.name);
    if (isJunk(entry.relativePath)) {
      skipped += 1;
    } else if (AUDIOBOOK_EXTENSIONS.includes(ext)) {
      if (known.has(`${entry.relativePath}|${entry.file.size}`)) {
        duplicates += 1;
      } else {
        known.add(`${entry.relativePath}|${entry.file.size}`);
        audio.push(entry);
      }
    } else if (IMAGE_EXTENSIONS.includes(ext)) {
      const folder = folderOf(entry.relativePath);
      imagesByFolder.set(folder, [...(imagesByFolder.get(folder) ?? []), entry]);
    } else {
      skipped += 1;
    }
  }

  const audioPerFolder = new Map<string, number>();
  for (const entry of audio) {
    const folder = folderOf(entry.relativePath);
    audioPerFolder.set(folder, (audioPerFolder.get(folder) ?? 0) + 1);
  }

  const coverFor = (folder: string): File | null => {
    const images = imagesByFolder.get(folder) ?? [];
    const named = COVER_NAMES.map((name) =>
      images.find((image) => image.file.name.toLowerCase().replace(/\.[^.]+$/, '') === name),
    ).find(Boolean);
    // A lone image in a book folder is almost always its cover.
    return named?.file ?? (images.length === 1 ? images[0].file : null);
  };

  return {
    books: audio
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true }))
      .map((entry) => ({
        ...entry,
        coverFile: coverFor(folderOf(entry.relativePath)),
        folderAudioCount: audioPerFolder.get(folderOf(entry.relativePath)) ?? 1,
      })),
    skipped,
    duplicates,
  };
}

// Expands a drop of files and/or folders into a flat list, walking
// sub-directories through the FileSystem entry API.
export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<PickedFile[]> {
  const entries = Array.from(dataTransfer.items ?? [])
    .map((item) => (item.kind === 'file' ? item.webkitGetAsEntry?.() : null))
    .filter((entry): entry is FileSystemEntry => !!entry);

  if (entries.length === 0) {
    return Array.from(dataTransfer.files ?? []).map((file) => ({ file, relativePath: file.name }));
  }

  const results: PickedFile[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      results.push({ file, relativePath: prefix + entry.name });
      return;
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns results in chunks; keep reading until it returns nothing.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) break;
        for (const child of batch) {
          await walk(child, `${prefix}${entry.name}/`);
        }
      }
    }
  };

  for (const entry of entries) {
    await walk(entry, '');
  }
  return results;
}

export function patchQueueItem(items: UploadQueueItem[], index: number, patch: Partial<UploadQueueItem>): UploadQueueItem[] {
  const nextItems = [...items];
  const current = nextItems[index];
  if (!current) {
    return items;
  }

  nextItems[index] = {
    ...current,
    ...patch,
  };
  return nextItems;
}

export function patchQueueItemById(
  items: UploadQueueItem[],
  itemId: string,
  mutate: (item: UploadQueueItem) => UploadQueueItem,
): UploadQueueItem[] {
  return items.map((item) => (item.id === itemId ? mutate(item) : item));
}

export function mergeTrackedJobs(current: Record<string, AdminJob>, jobs: AdminJob[], trackedIds: string[]): Record<string, AdminJob> {
  const tracked = new Set(trackedIds);
  const next = { ...current };
  for (const job of jobs) {
    if (tracked.has(job.id)) {
      next[job.id] = job;
    }
  }
  return next;
}

export function allTrackedJobsTerminal(trackedIds: string[], jobsById: Record<string, AdminJob>): boolean {
  return trackedIds.every((trackedJobId) => {
    const status = jobsById[trackedJobId]?.status;
    return status === 'done' || status === 'failed';
  });
}