import type { BookmarkRow, HighlightRow } from '@/state/rows';

/**
 * How bookmarks and highlights are stored on the server, and how a device's
 * copy is merged with it. Each book's annotations live in that book's display
 * preferences (see `getItemPrefs`), one JSON string per kind. Every device may
 * add or delete while offline, so the merge goes record by record, keeping
 * whichever side changed it last, rather than letting one device's list
 * replace another's.
 *
 * Deliberately free of runtime imports so the merge can be tested on its own.
 */

/** A record as it travels to and from the server: a row without this device's bookkeeping. */
export type SyncedBookmark = Omit<BookmarkRow, 'item_id' | 'synced_at'>;
export type SyncedHighlight = Omit<HighlightRow, 'item_id' | 'synced_at'>;

/** The fields every annotation has, and all the merge looks at. */
type Synced = Pick<SyncedBookmark, 'id' | 'location' | 'percent' | 'created_at' | 'updated_at' | 'deleted'>;

/** Everything that differs between bookmarks and highlights on the wire. */
export interface AnnotationKind<T extends Synced> {
  /** The display-preferences key this kind is stored under. */
  pref: string;
  /** The kind-specific fields of a stored entry, or `null` if it's unusable. */
  read(entry: Record<string, unknown>, common: Synced): T | null;
  /** The kind-specific fields to store, picked explicitly so local bookkeeping stays local. */
  write(record: T): Record<string, unknown>;
}

const text = (value: unknown) => (typeof value === 'string' ? value : null);

export const BOOKMARKS: AnnotationKind<SyncedBookmark> = {
  pref: 'bookmarks',
  read: (entry, common) => ({ ...common, label: text(entry.label), excerpt: text(entry.excerpt) }),
  write: (record) => ({ label: record.label, excerpt: record.excerpt }),
};

export const HIGHLIGHTS: AnnotationKind<SyncedHighlight> = {
  pref: 'highlights',
  read: (entry, common) =>
    typeof entry.text === 'string'
      ? {
          ...common,
          text: entry.text,
          note: text(entry.note),
          // The column's own default, for an entry that somehow lost its colour.
          color: text(entry.color) ?? 'yellow',
        }
      : null,
  write: (record) => ({ text: record.text, note: record.note, color: record.color }),
};

/** Bumped if the stored shape ever changes, so older builds know to keep their hands off. */
const FORMAT = 1;

/**
 * How long a deletion is remembered. A device that last opened the book before
 * then would bring back something deleted elsewhere, which is the price of not
 * keeping every annotation ever removed.
 */
const TOMBSTONE_DAYS = 180;

export function tombstoneCutoff(now: number): number {
  return now - TOMBSTONE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Reads the server's copy. Missing or unreadable data counts as empty, so the
 * next save repairs it. `null` means a newer version of the app wrote it, and
 * this one leaves it alone rather than overwrite what it can't read.
 */
export function parseAnnotations<T extends Synced>(
  kind: AnnotationKind<T>,
  raw: string | null | undefined,
): T[] | null {
  if (!raw) return [];
  let data: { v?: unknown; items?: unknown };
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof data?.v === 'number' && data.v > FORMAT) return null;
  if (!Array.isArray(data?.items)) return [];

  const records: T[] = [];
  for (const entry of data.items as Record<string, unknown>[]) {
    if (typeof entry?.id !== 'string' || typeof entry.location !== 'string') continue;
    const created = typeof entry.created_at === 'number' ? entry.created_at : 0;
    const record = kind.read(entry, {
      id: entry.id,
      location: entry.location,
      percent: typeof entry.percent === 'number' ? entry.percent : 0,
      created_at: created,
      updated_at: typeof entry.updated_at === 'number' ? entry.updated_at : created,
      deleted: entry.deleted ? 1 : 0,
    });
    if (record) records.push(record);
  }
  return records;
}

export function serializeAnnotations<T extends Synced>(kind: AnnotationKind<T>, records: T[]): string {
  return JSON.stringify({
    v: FORMAT,
    items: records.map((record) => ({
      id: record.id,
      location: record.location,
      percent: record.percent,
      created_at: record.created_at,
      updated_at: record.updated_at,
      deleted: record.deleted ? 1 : 0,
      ...kind.write(record),
    })),
  });
}

/**
 * Whether `a` is a later version of a record than `b`. On a tie the deletion
 * wins, so every device settles on the same answer.
 */
function supersedes(a: Synced, b: Synced): boolean {
  return a.updated_at > b.updated_at || (a.updated_at === b.updated_at && a.deleted > b.deleted);
}

export interface AnnotationMerge<T> {
  /** What both sides should hold afterwards, tombstones included. */
  merged: T[];
  /** Server versions this device should take on: new records, and deletions made elsewhere. */
  adopt: T[];
  /** Whether the server's copy is behind `merged` and needs writing. */
  push: boolean;
}

export function mergeAnnotations<T extends Synced>(
  local: T[],
  remote: T[],
  now: number,
): AnnotationMerge<T> {
  const theirs = new Map(remote.map((record) => [record.id, record]));
  const ours = new Map(local.map((record) => [record.id, record]));

  const latest = new Map(theirs);
  for (const mine of local) {
    const other = latest.get(mine.id);
    if (!other || supersedes(mine, other)) latest.set(mine.id, mine);
  }

  const cutoff = tombstoneCutoff(now);
  const merged = [...latest.values()].filter(
    (record) => !record.deleted || record.updated_at >= cutoff,
  );

  const adopt = merged.filter((record) => {
    const mine = ours.get(record.id);
    return !mine || supersedes(record, mine);
  });

  // A length mismatch catches expired tombstones still on the server.
  const push =
    merged.length !== remote.length ||
    merged.some((record) => {
      const other = theirs.get(record.id);
      return !other || supersedes(record, other);
    });

  return { merged, adopt, push };
}

export interface Reconciled<T> extends AnnotationMerge<T> {
  /** The stored string for `merged`, for when `push` says the server needs it. */
  value: string;
}

/**
 * Parses one kind from the server's preferences and merges this device's rows
 * into it. `null` when the stored copy is from a newer build and is left alone.
 */
export function reconcile<T extends Synced>(
  kind: AnnotationKind<T>,
  stored: Record<string, string | null> | null | undefined,
  local: T[],
  now: number,
): Reconciled<T> | null {
  const remote = parseAnnotations(kind, stored?.[kind.pref]);
  if (!remote) return null;
  const merge = mergeAnnotations(local, remote, now);
  return { ...merge, value: serializeAnnotations(kind, merge.merged) };
}
