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

export interface BookmarkRow {
  id: string;
  item_id: string;
  location: string;
  label: string | null;
  excerpt: string | null;
  percent: number;
  created_at: number;
}

export interface HighlightRow {
  id: string;
  item_id: string;
  location: string;
  text: string;
  note: string | null;
  color: string;
  percent: number;
  created_at: number;
}

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
