/**
 * Shapes of the rows in the local store, shared by the SQLite implementation
 * on device (`db.ts`) and the in-memory one in the browser (`db.web.ts`) so
 * the two cannot drift apart on types.
 */

export interface ProgressRow {
  item_id: string;
  percent: number;
  location: string | null;
  finished: number;
  updated_at: number;
  synced_at: number;
}

/**
 * Bookmarks and highlights sync with the server, so a deleted one stays
 * behind as a tombstone (`deleted = 1`) until the deletion has reached every
 * device. `synced_at` trails `updated_at` while a change is still to be pushed.
 */
export interface BookmarkRow {
  id: string;
  item_id: string;
  location: string;
  label: string | null;
  excerpt: string | null;
  percent: number;
  created_at: number;
  updated_at: number;
  deleted: number;
  synced_at: number;
}

/** What the reader supplies for a new bookmark; the store fills in the rest. */
export type NewBookmark = Pick<
  BookmarkRow,
  'id' | 'item_id' | 'location' | 'label' | 'excerpt' | 'percent'
>;

export interface HighlightRow {
  id: string;
  item_id: string;
  location: string;
  text: string;
  note: string | null;
  color: string;
  percent: number;
  created_at: number;
  updated_at: number;
  deleted: number;
  synced_at: number;
}

/** What the reader supplies for a new highlight; the store fills in the rest. */
export type NewHighlight = Pick<
  HighlightRow,
  'id' | 'item_id' | 'location' | 'text' | 'note' | 'color' | 'percent'
>;

/** The tables that sync with the server, and the rows each one holds. */
export interface AnnotationRows {
  bookmarks: BookmarkRow;
  highlights: HighlightRow;
}
export type AnnotationTable = keyof AnnotationRows;

export interface DownloadRow {
  item_id: string;
  uri: string;
  format: string;
  size: number;
  downloaded_at: number;
}

export interface LocalBookRow {
  id: string;
  uri: string;
  title: string;
  author: string | null;
  format: string;
  size: number;
  cover_uri: string | null;
  favorite: number;
  added_at: number;
}
