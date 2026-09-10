import type {
  BookmarkRow,
  DownloadRow,
  HighlightRow,
  LocalBookRow,
  ProgressRow,
} from './rows';

export type { BookmarkRow, DownloadRow, HighlightRow, LocalBookRow, ProgressRow };

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

/** Adopts a newer server-side position (e.g. read on another device). */
export function mergeServerProgress(itemId: string, percent: number, finished: boolean) {
  const local = getProgress(itemId);
  if (local && local.percent >= percent - 0.001) return;

  const now = Date.now();
  if (local) {
    // The server has no CFI to give us, so the local one is left in place.
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
    .filter((row) => row.item_id === itemId)
    .sort((a, b) => a.percent - b.percent);
}

export function addBookmark(row: Omit<BookmarkRow, 'created_at'>) {
  tables.bookmarks = tables.bookmarks.filter((existing) => existing.id !== row.id);
  tables.bookmarks.push({ ...row, created_at: Date.now() });
  touch('bookmarks');
}

export function removeBookmark(id: string) {
  tables.bookmarks = tables.bookmarks.filter((row) => row.id !== id);
  touch('bookmarks');
}

/* ------------------------------- highlights ------------------------------ */

export function listHighlights(itemId: string): HighlightRow[] {
  return tables.highlights
    .filter((row) => row.item_id === itemId)
    .sort((a, b) => a.percent - b.percent);
}

export function addHighlight(row: Omit<HighlightRow, 'created_at'>) {
  tables.highlights = tables.highlights.filter((existing) => existing.id !== row.id);
  tables.highlights.push({ ...row, created_at: Date.now() });
  touch('highlights');
}

export function removeHighlight(id: string) {
  tables.highlights = tables.highlights.filter((row) => row.id !== id);
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
