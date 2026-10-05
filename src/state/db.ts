import * as SQLite from 'expo-sqlite';

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
 * Local-first store. Everything the reader needs (position, bookmarks,
 * highlights, prefs) lives here so the app opens instantly and works offline;
 * progress, bookmarks and highlights are mirrored up to Jellyfin opportunistically.
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
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  deleted    INTEGER NOT NULL DEFAULT 0,
  synced_at  INTEGER NOT NULL DEFAULT 0
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
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  deleted    INTEGER NOT NULL DEFAULT 0,
  synced_at  INTEGER NOT NULL DEFAULT 0
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

/**
 * Columns added after a table first shipped. `CREATE TABLE IF NOT EXISTS`
 * leaves an existing table as it is, so databases from earlier builds pick
 * them up here instead.
 */
const ADDED_COLUMNS: [table: string, column: string, definition: string][] = [
  ['bookmarks', 'updated_at', 'INTEGER NOT NULL DEFAULT 0'],
  ['bookmarks', 'deleted', 'INTEGER NOT NULL DEFAULT 0'],
  ['bookmarks', 'synced_at', 'INTEGER NOT NULL DEFAULT 0'],
  ['highlights', 'updated_at', 'INTEGER NOT NULL DEFAULT 0'],
  ['highlights', 'deleted', 'INTEGER NOT NULL DEFAULT 0'],
  ['highlights', 'synced_at', 'INTEGER NOT NULL DEFAULT 0'],
];

const ANNOTATION_TABLES: AnnotationTable[] = ['bookmarks', 'highlights'];

function addMissingColumns(target: SQLite.SQLiteDatabase) {
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const columns = target.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
    if (columns.some((existing) => existing.name === column)) continue;
    target.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  // Annotations made before sync count as last changed when they were made.
  for (const table of ANNOTATION_TABLES) {
    target.execSync(`UPDATE ${table} SET updated_at = created_at WHERE updated_at = 0`);
  }
}

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
    // Pre-rename filename, kept so existing reading positions carry over.
    handle = SQLite.openDatabaseSync('jellyshelf.db');
    handle.execSync(SCHEMA);
    addMissingColumns(handle);
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

/**
 * Adopts a newer server-side position (e.g. read on another device). The
 * server has only a percentage, so any local CFI is dropped: it marks the older
 * place, and the reader would reopen there. Without one the reader resumes
 * from the percentage.
 */
export function mergeServerProgress(itemId: string, percent: number, finished: boolean) {
  const local = getProgress(itemId);
  if (local && local.percent >= percent - 0.001) return;
  db.runSync(
    `INSERT INTO progress (item_id, percent, location, finished, updated_at, synced_at)
     VALUES (?, ?, NULL, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       percent = excluded.percent, location = NULL, finished = excluded.finished,
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
    'SELECT * FROM bookmarks WHERE item_id = ? AND deleted = 0 ORDER BY percent ASC',
    itemId,
  );
}

export function addBookmark(row: NewBookmark) {
  const now = Date.now();
  db.runSync(
    `INSERT OR REPLACE INTO bookmarks
       (id, item_id, location, label, excerpt, percent, created_at, updated_at, deleted, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
    row.id,
    row.item_id,
    row.location,
    row.label,
    row.excerpt,
    row.percent,
    now,
    now,
  );
}

/** Leaves a tombstone, so the deletion reaches the server and other devices. */
export function removeBookmark(id: string) {
  db.runSync('UPDATE bookmarks SET deleted = 1, updated_at = ? WHERE id = ?', Date.now(), id);
}

/** Takes on the server's version of a bookmark, which is already in sync by definition. */
export function adoptBookmark(row: Omit<BookmarkRow, 'synced_at'>) {
  db.runSync(
    `INSERT OR REPLACE INTO bookmarks
       (id, item_id, location, label, excerpt, percent, created_at, updated_at, deleted, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.item_id,
    row.location,
    row.label,
    row.excerpt,
    row.percent,
    row.created_at,
    row.updated_at,
    row.deleted ? 1 : 0,
    row.updated_at,
  );
}

/* ------------------------------- highlights ------------------------------ */

export function listHighlights(itemId: string): HighlightRow[] {
  return db.getAllSync<HighlightRow>(
    'SELECT * FROM highlights WHERE item_id = ? AND deleted = 0 ORDER BY percent ASC',
    itemId,
  );
}

export function addHighlight(row: NewHighlight) {
  const now = Date.now();
  db.runSync(
    `INSERT OR REPLACE INTO highlights
       (id, item_id, location, text, note, color, percent, created_at, updated_at, deleted, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
    row.id,
    row.item_id,
    row.location,
    row.text,
    row.note,
    row.color,
    row.percent,
    now,
    now,
  );
}

/** Leaves a tombstone, so the deletion reaches the server and other devices. */
export function removeHighlight(id: string) {
  db.runSync('UPDATE highlights SET deleted = 1, updated_at = ? WHERE id = ?', Date.now(), id);
}

/** Takes on the server's version of a highlight, which is already in sync by definition. */
export function adoptHighlight(row: Omit<HighlightRow, 'synced_at'>) {
  db.runSync(
    `INSERT OR REPLACE INTO highlights
       (id, item_id, location, text, note, color, percent, created_at, updated_at, deleted, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.item_id,
    row.location,
    row.text,
    row.note,
    row.color,
    row.percent,
    row.created_at,
    row.updated_at,
    row.deleted ? 1 : 0,
    row.updated_at,
  );
}

/* ------------------------------ annotation sync ----------------------------- */

/** Every row for a book, tombstones included, for merging with the server's copy. */
export function listAnnotationRecords<T extends AnnotationTable>(
  table: T,
  itemId: string,
): AnnotationRows[T][] {
  return db.getAllSync<AnnotationRows[T]>(`SELECT * FROM ${table} WHERE item_id = ?`, itemId);
}

/** Deletes outright, for books that never sync (the ones in the Files folder). */
export function purgeAnnotation(table: AnnotationTable, id: string) {
  db.runSync(`DELETE FROM ${table} WHERE id = ?`, id);
}

/**
 * Records that the server now holds these versions. A row changed again while
 * the save was in flight has a newer `updated_at`, so it stays pending.
 */
export function markAnnotationsSynced(
  table: AnnotationTable,
  rows: { id: string; updated_at: number }[],
) {
  for (const row of rows) {
    db.runSync(
      `UPDATE ${table} SET synced_at = updated_at WHERE id = ? AND updated_at = ?`,
      row.id,
      row.updated_at,
    );
  }
}

/** Books with bookmark or highlight changes the server hasn't seen yet. */
export function pendingAnnotationItems(): string[] {
  return db
    .getAllSync<{ item_id: string }>(
      `SELECT item_id FROM bookmarks WHERE synced_at < updated_at
       UNION
       SELECT item_id FROM highlights WHERE synced_at < updated_at`,
    )
    .map((row) => row.item_id);
}

/** Forgets deletions old enough that the server has stopped carrying them too. */
export function dropAnnotationTombstones(itemId: string, before: number) {
  for (const table of ANNOTATION_TABLES) {
    db.runSync(
      `DELETE FROM ${table} WHERE item_id = ? AND deleted = 1 AND updated_at < ?`,
      itemId,
      before,
    );
  }
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
