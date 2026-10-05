import type {
  AnnotationRows,
  AnnotationTable,
  BookmarkRow,
  DownloadRow,
  HighlightRow,
  LocalBookRow,
  NewBookmark,
  NewHighlight,
  ProgressRow,
} from './rows';

export type {
  AnnotationTable,
  BookmarkRow,
  DownloadRow,
  HighlightRow,
  LocalBookRow,
  NewBookmark,
  NewHighlight,
  ProgressRow,
};

/**
 * Browser twin of `db.ts`.
 *
 * The device build keeps this in SQLite and reads it synchronously, which the
 * whole app depends on — the routing gate, the shelves and the reader all call
 * straight into these functions during render. expo-sqlite can run in the
 * browser, but its synchronous API is bridged to a worker over
 * SharedArrayBuffer, which means the page must be served cross-origin isolated
 * (COOP/COEP). That is a hard requirement to meet when the natural place to
 * host this is next to Jellyfin itself, and it costs a 600KB wasm download
 * besides.
 *
 * So the browser keeps the same data in memory and persists it to IndexedDB.
 * Reads stay synchronous and free, writes are mirrored out on a short debounce,
 * and `initDatabase` hydrates everything before the app mounts. The data is
 * small by nature: a row per book you have opened, plus bookmarks and
 * highlights.
 */

// Pre-rename name, kept so existing reading positions carry over.
const DB_NAME = 'jellyshelf';
const STORE = 'tables';
const VERSION = 1;

interface Tables {
  progress: ProgressRow[];
  bookmarks: BookmarkRow[];
  highlights: HighlightRow[];
  downloads: DownloadRow[];
  local_books: LocalBookRow[];
  kv: Record<string, string>;
}

const empty = (): Tables => ({
  progress: [],
  bookmarks: [],
  highlights: [],
  downloads: [],
  local_books: [],
  kv: {},
});

let tables: Tables = empty();
let idb: IDBDatabase | null = null;

/* ------------------------------ persistence ------------------------------ */

const dirty = new Set<keyof Tables>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  flushTimer = null;
  if (!idb || dirty.size === 0) return;

  const pending = [...dirty];
  dirty.clear();
  try {
    const tx = idb.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const name of pending) store.put(tables[name], name);
  } catch {
    // A failed write costs this session's changes, not the app. Reads are
    // already served from memory, so nothing downstream notices.
  }
}

/** Queues a table for persistence. Writes are frequent; disk writes are not. */
function touch(name: keyof Tables) {
  dirty.add(name);
  flushTimer ??= setTimeout(flush, 150);
}

function openIdb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, VERSION);
    } catch {
      // Private browsing and blocked site data both throw here.
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function readAll(handle: IDBDatabase): Promise<Partial<Tables>> {
  return new Promise((resolve) => {
    const loaded: Partial<Tables> = {};
    let tx: IDBTransaction;
    try {
      tx = handle.transaction(STORE, 'readonly');
    } catch {
      resolve(loaded);
      return;
    }
    const store = tx.objectStore(STORE);
    for (const name of Object.keys(empty()) as (keyof Tables)[]) {
      const request = store.get(name);
      request.onsuccess = () => {
        if (request.result !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (loaded as any)[name] = request.result;
        }
      };
    }
    tx.oncomplete = () => resolve(loaded);
    tx.onerror = () => resolve(loaded);
    tx.onabort = () => resolve(loaded);
  });
}

let opening: Promise<void> | null = null;

/**
 * Hydrates the store. Called once from the root layout, which holds the splash
 * screen until it resolves, so every read after this point is synchronous.
 */
export function initDatabase(): Promise<void> {
  opening ??= (async () => {
    idb = await openIdb();
    if (!idb) return; // Memory-only: the app works, nothing survives a reload.
    Object.assign(tables, await readAll(idb));
    // Annotations saved before sync lack its bookkeeping. They count as last
    // changed when they were made, and as not yet on the server.
    for (const row of [...tables.bookmarks, ...tables.highlights]) {
      row.updated_at ??= row.created_at;
      row.deleted ??= 0;
      row.synced_at ??= 0;
    }
  })();
  return opening;
}

/* -------------------------------- progress ------------------------------- */

export function getProgress(itemId: string): ProgressRow | null {
  return tables.progress.find((row) => row.item_id === itemId) ?? null;
}

export function getAllProgress(): ProgressRow[] {
  return [...tables.progress].sort((a, b) => b.updated_at - a.updated_at);
}

export function saveProgress(
  itemId: string,
  percent: number,
  location: string | null,
  finished = false,
) {
  const clamped = Math.max(0, Math.min(1, percent));
  const now = Date.now();
  const existing = getProgress(itemId);

  if (existing) {
    existing.percent = clamped;
    existing.location = location;
    existing.finished = finished ? 1 : 0;
    existing.updated_at = now;
    existing.synced_at = 0;
  } else {
    tables.progress.push({
      item_id: itemId,
      percent: clamped,
      location,
      finished: finished ? 1 : 0,
      updated_at: now,
      synced_at: 0,
    });
  }
  touch('progress');
}

export function markSynced(itemId: string) {
  const row = getProgress(itemId);
  if (!row) return;
  row.synced_at = Date.now();
  touch('progress');
}

export function pendingSync(): ProgressRow[] {
  return tables.progress.filter((row) => row.synced_at < row.updated_at);
}

/**
 * Adopts a newer server-side position (e.g. read on another device). The
 * server has only a percentage, so any local CFI is dropped: it marks the older
 * place, and the reader would reopen there. Without one the reader resumes
 * from the percentage.
 */
export function mergeServerProgress(itemId: string, percent: number, finished: boolean) {
  const local = getProgress(itemId);
  if (local && local.percent >= percent - 0.001) return;

  const now = Date.now();
  if (local) {
    local.location = null;
    local.percent = percent;
    local.finished = finished ? 1 : 0;
    local.updated_at = now;
    local.synced_at = now;
  } else {
    tables.progress.push({
      item_id: itemId,
      percent,
      location: null,
      finished: finished ? 1 : 0,
      updated_at: now,
      synced_at: now,
    });
  }
  touch('progress');
}

export function clearProgress(itemId: string) {
  tables.progress = tables.progress.filter((row) => row.item_id !== itemId);
  touch('progress');
}

/* ------------------------------- bookmarks ------------------------------- */

export function listBookmarks(itemId: string): BookmarkRow[] {
  return tables.bookmarks
    .filter((row) => row.item_id === itemId && !row.deleted)
    .sort((a, b) => a.percent - b.percent);
}

export function addBookmark(row: NewBookmark) {
  const now = Date.now();
  tables.bookmarks = tables.bookmarks.filter((existing) => existing.id !== row.id);
  tables.bookmarks.push({ ...row, created_at: now, updated_at: now, deleted: 0, synced_at: 0 });
  touch('bookmarks');
}

/** Leaves a tombstone, so the deletion reaches the server and other devices. */
export function removeBookmark(id: string) {
  const row = tables.bookmarks.find((existing) => existing.id === id);
  if (!row) return;
  row.deleted = 1;
  row.updated_at = Date.now();
  touch('bookmarks');
}

/** Takes on the server's version of a bookmark, which is already in sync by definition. */
export function adoptBookmark(row: Omit<BookmarkRow, 'synced_at'>) {
  tables.bookmarks = tables.bookmarks.filter((existing) => existing.id !== row.id);
  tables.bookmarks.push({ ...row, deleted: row.deleted ? 1 : 0, synced_at: row.updated_at });
  touch('bookmarks');
}

/* ------------------------------- highlights ------------------------------ */

export function listHighlights(itemId: string): HighlightRow[] {
  return tables.highlights
    .filter((row) => row.item_id === itemId && !row.deleted)
    .sort((a, b) => a.percent - b.percent);
}

export function addHighlight(row: NewHighlight) {
  const now = Date.now();
  tables.highlights = tables.highlights.filter((existing) => existing.id !== row.id);
  tables.highlights.push({ ...row, created_at: now, updated_at: now, deleted: 0, synced_at: 0 });
  touch('highlights');
}

/** Leaves a tombstone, so the deletion reaches the server and other devices. */
export function removeHighlight(id: string) {
  const row = tables.highlights.find((existing) => existing.id === id);
  if (!row) return;
  row.deleted = 1;
  row.updated_at = Date.now();
  touch('highlights');
}

/** Takes on the server's version of a highlight, which is already in sync by definition. */
export function adoptHighlight(row: Omit<HighlightRow, 'synced_at'>) {
  tables.highlights = tables.highlights.filter((existing) => existing.id !== row.id);
  tables.highlights.push({ ...row, deleted: row.deleted ? 1 : 0, synced_at: row.updated_at });
  touch('highlights');
}

/* ------------------------------ annotation sync ----------------------------- */

/**
 * Every row for a book, tombstones included, for merging with the server's
 * copy. They're copies, as SQLite's would be: removing an annotation edits its
 * row in place, and a sync holding the live row would then think the edit was
 * saved.
 */
export function listAnnotationRecords<T extends AnnotationTable>(
  table: T,
  itemId: string,
): AnnotationRows[T][] {
  const rows = tables[table] as AnnotationRows[T][];
  return rows.filter((row) => row.item_id === itemId).map((row) => ({ ...row }));
}

/** Deletes outright, for books that never sync (the ones in the Files folder). */
export function purgeAnnotation(table: AnnotationTable, id: string) {
  if (table === 'bookmarks') tables.bookmarks = tables.bookmarks.filter((row) => row.id !== id);
  else tables.highlights = tables.highlights.filter((row) => row.id !== id);
  touch(table);
}

/**
 * Records that the server now holds these versions. A row changed again while
 * the save was in flight has a newer `updated_at`, so it stays pending.
 */
export function markAnnotationsSynced(
  table: AnnotationTable,
  rows: { id: string; updated_at: number }[],
) {
  const current: { id: string; updated_at: number; synced_at: number }[] = tables[table];
  for (const synced of rows) {
    const row = current.find((existing) => existing.id === synced.id);
    if (row && row.updated_at === synced.updated_at) row.synced_at = row.updated_at;
  }
  touch(table);
}

/** Books with bookmark or highlight changes the server hasn't seen yet. */
export function pendingAnnotationItems(): string[] {
  const pending = [...tables.bookmarks, ...tables.highlights].filter(
    (row) => row.synced_at < row.updated_at,
  );
  return [...new Set(pending.map((row) => row.item_id))];
}

/** Forgets deletions old enough that the server has stopped carrying them too. */
export function dropAnnotationTombstones(itemId: string, before: number) {
  const expired = (row: { item_id: string; deleted: number; updated_at: number }) =>
    row.item_id === itemId && !!row.deleted && row.updated_at < before;
  tables.bookmarks = tables.bookmarks.filter((row) => !expired(row));
  tables.highlights = tables.highlights.filter((row) => !expired(row));
  touch('bookmarks');
  touch('highlights');
}

/* ------------------------------- downloads ------------------------------- */

export function getDownload(itemId: string): DownloadRow | null {
  return tables.downloads.find((row) => row.item_id === itemId) ?? null;
}

export function listDownloads(): DownloadRow[] {
  return [...tables.downloads].sort((a, b) => b.downloaded_at - a.downloaded_at);
}

export function recordDownload(row: DownloadRow) {
  tables.downloads = tables.downloads.filter((existing) => existing.item_id !== row.item_id);
  tables.downloads.push({ ...row });
  touch('downloads');
}

export function forgetDownload(itemId: string) {
  tables.downloads = tables.downloads.filter((row) => row.item_id !== itemId);
  touch('downloads');
}

/* ------------------------------ local books ------------------------------ */

export function listLocalBooks(): LocalBookRow[] {
  return [...tables.local_books].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  );
}

export function getLocalBook(id: string): LocalBookRow | null {
  return tables.local_books.find((row) => row.id === id) ?? null;
}

/** Insert on first sight; refresh size/uri but keep metadata we've since learned. */
export function upsertLocalBook(row: Omit<LocalBookRow, 'favorite' | 'added_at' | 'cover_uri'>) {
  const existing = getLocalBook(row.id);
  if (existing) {
    existing.uri = row.uri;
    existing.size = row.size;
  } else {
    tables.local_books.push({
      ...row,
      cover_uri: null,
      favorite: 0,
      added_at: Date.now(),
    });
  }
  touch('local_books');
}

/** The reader reports real metadata once a book is open; keep the better values. */
export function enrichLocalBook(
  id: string,
  patch: { title?: string | null; author?: string | null; coverUri?: string | null },
) {
  const existing = getLocalBook(id);
  if (!existing) return;
  existing.title = patch.title?.trim() || existing.title;
  existing.author = patch.author?.trim() || existing.author;
  existing.cover_uri = 'coverUri' in patch ? (patch.coverUri ?? null) : existing.cover_uri;
  touch('local_books');
}

export function setLocalFavorite(id: string, favorite: boolean) {
  const existing = getLocalBook(id);
  if (!existing) return;
  existing.favorite = favorite ? 1 : 0;
  touch('local_books');
}

export function removeLocalBook(id: string) {
  tables.local_books = tables.local_books.filter((row) => row.id !== id);
  touch('local_books');
}

/** Drops records whose file has since disappeared from the Files folder. */
export function pruneLocalBooks(keepIds: string[]) {
  const rows = listLocalBooks();
  for (const row of rows) {
    if (!keepIds.includes(row.id)) removeLocalBook(row.id);
  }
}

/* ----------------------------------- kv ---------------------------------- */

export function kvGet<T>(key: string, fallback: T): T {
  const raw = tables.kv[key];
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function kvSet(key: string, value: unknown) {
  tables.kv[key] = JSON.stringify(value);
  touch('kv');
}

export function wipeLocalData() {
  tables = empty();
  for (const name of Object.keys(tables) as (keyof Tables)[]) touch(name);
}
