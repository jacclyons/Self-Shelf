import * as SQLite from 'expo-sqlite';

import type {
  BookmarkRow,
  DownloadRow,
  HighlightRow,
  LocalBookRow,
  ProgressRow,
} from './rows';

export type { BookmarkRow, DownloadRow, HighlightRow, LocalBookRow, ProgressRow };

/**
 * Local-first store. Everything the reader needs (position, bookmarks,
 * highlights, prefs) lives here so the app opens instantly and works offline;
 * progress is mirrored up to Jellyfin opportunistically.
 */
const SCHEMA = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS progress (
  item_id     TEXT PRIMARY KEY NOT NULL,
  percent     REAL NOT NULL DEFAULT 0,
  location    TEXT,
  finished    INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  synced_at   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id         TEXT PRIMARY KEY NOT NULL,
  item_id    TEXT NOT NULL,
  location   TEXT NOT NULL,
  label      TEXT,
  excerpt    TEXT,
  percent    REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bookmarks_item ON bookmarks(item_id);

CREATE TABLE IF NOT EXISTS highlights (
  id         TEXT PRIMARY KEY NOT NULL,
  item_id    TEXT NOT NULL,
  location   TEXT NOT NULL,
  text       TEXT NOT NULL,
  note       TEXT,
  color      TEXT NOT NULL DEFAULT 'yellow',
  percent    REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS highlights_item ON highlights(item_id);

CREATE TABLE IF NOT EXISTS downloads (
  item_id       TEXT PRIMARY KEY NOT NULL,
  uri           TEXT NOT NULL,
  format        TEXT NOT NULL,
  size          INTEGER NOT NULL DEFAULT 0,
  downloaded_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS local_books (
  id         TEXT PRIMARY KEY NOT NULL,
  uri        TEXT NOT NULL,
  title      TEXT NOT NULL,
  author     TEXT,
  format     TEXT NOT NULL,
  size       INTEGER NOT NULL DEFAULT 0,
  cover_uri  TEXT,
  favorite   INTEGER NOT NULL DEFAULT 0,
  added_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

let handle: SQLite.SQLiteDatabase | null = null;

/**
 * Every query in this file goes through here. The real handle cannot exist
 * until `initDatabase` has resolved, so touching a query before that is a
 * programming error worth surfacing rather than papering over.
 */
const db = new Proxy({} as SQLite.SQLiteDatabase, {
  get(_target, prop) {
    if (!handle) throw new Error('Database used before initDatabase() resolved.');
    const value = Reflect.get(handle, prop, handle);
    return typeof value === 'function' ? value.bind(handle) : value;
  },
});

let opening: Promise<void> | null = null;

/**
 * Opens the database and applies the schema. Called once from the root layout,
 * which holds the splash screen until it resolves. The browser has its own
 * store in `db.web.ts`; see the note there for why it is not SQLite.
 */
export function initDatabase(): Promise<void> {
  opening ??= (async () => {
    handle = SQLite.openDatabaseSync('jellyshelf.db');
    handle.execSync(SCHEMA);
  })();
  return opening;
}

/* -------------------------------- progress ------------------------------- */

export function getProgress(itemId: string): ProgressRow | null {
  return db.getFirstSync<ProgressRow>('SELECT * FROM progress WHERE item_id = ?', itemId) ?? null;
}

export function getAllProgress(): ProgressRow[] {
  return db.getAllSync<ProgressRow>('SELECT * FROM progress ORDER BY updated_at DESC');
}

export function saveProgress(
  itemId: string,
  percent: number,
  location: string | null,
  finished = false,
) {
  db.runSync(
    `INSERT INTO progress (item_id, percent, location, finished, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, 0)
     ON CONFLICT(item_id) DO UPDATE SET
       percent = excluded.percent,
       location = excluded.location,
       finished = excluded.finished,
       updated_at = excluded.updated_at,
       synced_at = 0`,
    itemId,
    Math.max(0, Math.min(1, percent)),
    location,
    finished ? 1 : 0,
    Date.now(),
  );
}

export function markSynced(itemId: string) {
  db.runSync('UPDATE progress SET synced_at = ? WHERE item_id = ?', Date.now(), itemId);
}

export function pendingSync(): ProgressRow[] {
  return db.getAllSync<ProgressRow>('SELECT * FROM progress WHERE synced_at < updated_at');
}

/** Adopts a newer server-side position (e.g. read on another device). */
export function mergeServerProgress(itemId: string, percent: number, finished: boolean) {
  const local = getProgress(itemId);
  if (local && local.percent >= percent - 0.001) return;
  db.runSync(
    `INSERT INTO progress (item_id, percent, location, finished, updated_at, synced_at)
     VALUES (?, ?, NULL, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       percent = excluded.percent, finished = excluded.finished,
       updated_at = excluded.updated_at, synced_at = excluded.synced_at`,
    itemId,
    percent,
    finished ? 1 : 0,
    Date.now(),
    Date.now(),
  );
}

export function clearProgress(itemId: string) {
  db.runSync('DELETE FROM progress WHERE item_id = ?', itemId);
}

/* ------------------------------- bookmarks ------------------------------- */

export function listBookmarks(itemId: string): BookmarkRow[] {
  return db.getAllSync<BookmarkRow>(
    'SELECT * FROM bookmarks WHERE item_id = ? ORDER BY percent ASC',
    itemId,
  );
}

export function addBookmark(row: Omit<BookmarkRow, 'created_at'>) {
  db.runSync(
    `INSERT OR REPLACE INTO bookmarks (id, item_id, location, label, excerpt, percent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.item_id,
    row.location,
    row.label,
    row.excerpt,
    row.percent,
    Date.now(),
  );
}

export function removeBookmark(id: string) {
  db.runSync('DELETE FROM bookmarks WHERE id = ?', id);
}

/* ------------------------------- highlights ------------------------------ */

export function listHighlights(itemId: string): HighlightRow[] {
  return db.getAllSync<HighlightRow>(
    'SELECT * FROM highlights WHERE item_id = ? ORDER BY percent ASC',
    itemId,
  );
}

export function addHighlight(row: Omit<HighlightRow, 'created_at'>) {
  db.runSync(
    `INSERT OR REPLACE INTO highlights (id, item_id, location, text, note, color, percent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.item_id,
    row.location,
    row.text,
    row.note,
    row.color,
    row.percent,
    Date.now(),
  );
}

export function removeHighlight(id: string) {
  db.runSync('DELETE FROM highlights WHERE id = ?', id);
}

/* ------------------------------- downloads ------------------------------- */

export function getDownload(itemId: string): DownloadRow | null {
  return db.getFirstSync<DownloadRow>('SELECT * FROM downloads WHERE item_id = ?', itemId) ?? null;
}

export function listDownloads(): DownloadRow[] {
  return db.getAllSync<DownloadRow>('SELECT * FROM downloads ORDER BY downloaded_at DESC');
}

export function recordDownload(row: DownloadRow) {
  db.runSync(
    `INSERT OR REPLACE INTO downloads (item_id, uri, format, size, downloaded_at)
     VALUES (?, ?, ?, ?, ?)`,
    row.item_id,
    row.uri,
    row.format,
    row.size,
    row.downloaded_at,
  );
}

export function forgetDownload(itemId: string) {
  db.runSync('DELETE FROM downloads WHERE item_id = ?', itemId);
}

/* ------------------------------ local books ------------------------------ */

export function listLocalBooks(): LocalBookRow[] {
  return db.getAllSync<LocalBookRow>('SELECT * FROM local_books ORDER BY title COLLATE NOCASE');
}

export function getLocalBook(id: string): LocalBookRow | null {
  return db.getFirstSync<LocalBookRow>('SELECT * FROM local_books WHERE id = ?', id) ?? null;
}

/** Insert on first sight; refresh size/uri but keep metadata we've since learned. */
export function upsertLocalBook(row: Omit<LocalBookRow, 'favorite' | 'added_at' | 'cover_uri'>) {
  db.runSync(
    `INSERT INTO local_books (id, uri, title, author, format, size, cover_uri, favorite, added_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?)
     ON CONFLICT(id) DO UPDATE SET uri = excluded.uri, size = excluded.size`,
    row.id,
    row.uri,
    row.title,
    row.author,
    row.format,
    row.size,
    Date.now(),
  );
}

/** The reader reports real metadata once a book is open; keep the better values. */
export function enrichLocalBook(
  id: string,
  patch: { title?: string | null; author?: string | null; coverUri?: string | null },
) {
  const existing = getLocalBook(id);
  if (!existing) return;
  db.runSync(
    'UPDATE local_books SET title = ?, author = ?, cover_uri = ? WHERE id = ?',
    patch.title?.trim() || existing.title,
    patch.author?.trim() || existing.author,
    'coverUri' in patch ? (patch.coverUri ?? null) : existing.cover_uri,
    id,
  );
}

export function setLocalFavorite(id: string, favorite: boolean) {
  db.runSync('UPDATE local_books SET favorite = ? WHERE id = ?', favorite ? 1 : 0, id);
}

export function removeLocalBook(id: string) {
  db.runSync('DELETE FROM local_books WHERE id = ?', id);
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
  const row = db.getFirstSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function kvSet(key: string, value: unknown) {
  db.runSync(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}

export function wipeLocalData() {
  db.execSync(
    'DELETE FROM progress; DELETE FROM bookmarks; DELETE FROM highlights; DELETE FROM downloads; DELETE FROM local_books; DELETE FROM kv;',
  );
}

export default db;
