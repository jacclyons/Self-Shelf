import type { BaseItem } from '@/api/types';
import { getProgress, listLocalBooks, type LocalBookRow } from '@/state/db';

/**
 * Web twin of `localBooks.ts`.
 *
 * The native build scans the Self-Shelf folder in Files and treats whatever it
 * finds as part of the shelf. A browser has no such folder, so there are no
 * local books here — rows already in SQLite from another device stay readable
 * as metadata, but nothing is scanned or imported.
 *
 * Bringing this to parity means a file picker writing into OPFS, which lands
 * with offline downloads rather than before them.
 */

const LOCAL_PREFIX = 'local:';

export function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_PREFIX);
}

/** Nothing to scan: the browser cannot see a folder of your books. */
export function scanLocalBooks(): LocalBookRow[] {
  return [];
}

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
  return localItems().find((item) => item.Id === id) ?? null;
}

/** No file ever backs a local row in the browser, so these cannot be opened. */
export function localFileFor(_id: string): { uri: string } | null {
  return null;
}

export const canImport = false;

export function importBooks(): Promise<number> {
  return Promise.resolve(0);
}
