import { Directory, File, Paths } from 'expo-file-system';

import type { BaseItem } from '@/api/types';
import {
  getLocalBook,
  listLocalBooks,
  pruneLocalBooks,
  upsertLocalBook,
  type LocalBookRow,
} from '@/state/db';
import { getProgress } from '@/state/db';

const READABLE = ['epub', 'pdf', 'cbz', 'cbr'] as const;
const MAX_DEPTH = 3;
/** Folders we own inside Documents that must never appear as your books. */
const INTERNAL_DIRS = ['.jellyshelf', 'SQLite', 'shelf'];
const LOCAL_PREFIX = 'local:';

export function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_PREFIX);
}

/** Stable id from the path, so progress survives app restarts and rescans. */
function idFor(relativePath: string): string {
  let hash = 5381;
  for (let i = 0; i < relativePath.length; i++) {
    hash = ((hash << 5) + hash + relativePath.charCodeAt(i)) >>> 0;
  }
  return `${LOCAL_PREFIX}${hash.toString(36)}-${relativePath.length}`;
}

/**
 * Filenames carry more than they look like they do: "Austen, Jane - Emma.epub"
 * or "Jane Austen - Emma.epub" both give us an author for free.
 */
function parseFilename(filename: string): { title: string; author: string | null } {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();

  const dashed = base.split(/\s+[-–—]\s+/);
  if (dashed.length >= 2) {
    const [first, ...rest] = dashed;
    const title = rest.join(' - ').trim();
    // "Surname, Forename" reads as an author; anything else we treat as a title.
    const looksLikeAuthor = /^[^,]+,\s*\S+/.test(first) || first.split(/\s+/).length <= 4;
    if (looksLikeAuthor && title) {
      const author = /^([^,]+),\s*(.+)$/.exec(first);
      return { title, author: author ? `${author[2].trim()} ${author[1].trim()}` : first.trim() };
    }
  }

  return { title: base || filename, author: null };
}

function extensionOf(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase();
}

function walk(dir: Directory, depth: number, out: File[]) {
  if (depth > MAX_DEPTH) return;
  let entries: (Directory | File)[];
  try {
    entries = dir.list();
  } catch {
    return;
  }

  for (const entry of entries) {
    const name = entry.name;
    // Skip our own storage and anything hidden.
    if (name.startsWith('.') || (depth === 0 && INTERNAL_DIRS.includes(name))) continue;

    if (entry instanceof Directory) {
      walk(entry, depth + 1, out);
    } else if ((READABLE as readonly string[]).includes(extensionOf(name))) {
      out.push(entry);
    }
  }
}

/**
 * Scans the Files-visible folder and reconciles it with what we already know.
 * Records are keyed by path so reading positions survive a rescan.
 */
export function scanLocalBooks(): LocalBookRow[] {
  const root = new Directory(Paths.document);
  if (!root.exists) return [];

  const found: File[] = [];
  walk(root, 0, found);

  const rootUri = root.uri.replace(/\/?$/, '/');
  const ids: string[] = [];

  for (const file of found) {
    const relative = decodeURIComponent(file.uri.replace(rootUri, ''));
    const id = idFor(relative);
    ids.push(id);

    const { title, author } = parseFilename(file.name);
    upsertLocalBook({
      id,
      uri: file.uri,
      title,
      author,
      format: extensionOf(file.name),
      size: file.size ?? 0,
    });
  }

  pruneLocalBooks(ids);
  return listLocalBooks();
}

/** Presents a local file with the same shape the rest of the app expects. */
export function localBookToItem(row: LocalBookRow): BaseItem {
  const progress = getProgress(row.id);
  return {
    Id: row.id,
    Name: row.title,
    SortName: row.title.toLowerCase(),
    Type: 'Book',
    Container: row.format,
    Path: row.uri,
    LocalCoverUri: row.cover_uri,
    DateCreated: new Date(row.added_at).toISOString(),
    People: row.author ? [{ Name: row.author, Type: 'Author' }] : null,
    UserData: {
      IsFavorite: row.favorite === 1,
      Played: progress?.finished === 1,
      PlaybackPositionTicks: 0,
      PlayedPercentage: (progress?.percent ?? 0) * 100,
    },
  };
}

export function localItems(): BaseItem[] {
  return listLocalBooks().map(localBookToItem);
}

export function localItem(id: string): BaseItem | null {
  const row = getLocalBook(id);
  return row ? localBookToItem(row) : null;
}

export function localFileFor(id: string): File | null {
  const row = getLocalBook(id);
  if (!row) return null;
  const file = new File(row.uri);
  return file.exists ? file : null;
}

/** Copies a picked file into the visible folder so it stays put. */
/** Web has no Files folder to import from; native does. */
export const canImport = true;

export async function importBooks(): Promise<number> {
  const result = await File.pickFileAsync({
    multipleFiles: true,
    mimeTypes: ['application/epub+zip', 'application/pdf'],
  });
  if (result.canceled) return 0;

  const root = new Directory(Paths.document);
  let imported = 0;

  for (const picked of result.result) {
    const ext = extensionOf(picked.name);
    if (!(READABLE as readonly string[]).includes(ext)) continue;

    let target = new File(root, picked.name);
    // Don't clobber a book of the same name that's already here.
    let n = 2;
    while (target.exists) {
      const stem = picked.name.replace(/\.[^.]+$/, '');
      target = new File(root, `${stem} (${n++}).${ext}`);
    }

    try {
      picked.copySync(target);
      imported++;
    } catch {
      // A single unreadable pick shouldn't abort the whole import.
    }
  }

  scanLocalBooks();
  return imported;
}
