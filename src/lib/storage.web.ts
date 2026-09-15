import { downloadUrl, type Session } from '@/api/client';
import { formatOf, type BaseItem, type BookFormat } from '@/api/types';
import { forgetDownload, listDownloads } from '@/state/db';

/**
 * Web twin of `storage.ts`.
 *
 * The native build copies a reader engine to disk and pulls books down beside
 * it so everything can be read over `file://`. The browser has neither of
 * those affordances, so the shapes here are deliberately different:
 *
 *   - the engine ships as static files in `public/reader/`, served from our own
 *     origin, so there is nothing to unpack at runtime;
 *   - books stream straight from Jellyfin, authenticated with `ApiKey` in the
 *     query string because an iframe cannot carry an Authorization header.
 *
 * Offline downloads are therefore not available on web yet. Doing it properly
 * needs a service worker handing out stable URLs backed by OPFS; until that
 * exists these functions report "nothing downloaded" rather than pretending.
 */

/** Only `ReaderView` reads this, and web has its own ReaderView. Parity only. */
export const SHELF_ROOT = { uri: '/reader/' };

/** The engine is static in `public/`, so this resolves immediately. */
export function ensureReaderEngine(): Promise<string> {
  return Promise.resolve('/reader/reader.html');
}

export function extensionFor(format: BookFormat, item: BaseItem): string {
  if (format === 'epub') return 'epub';
  if (format === 'pdf') return 'pdf';
  if (format === 'comic') {
    const ext = (item.Container || item.Path?.split('.').pop() || '').toLowerCase();
    return ext.includes('rar') ? 'cbr' : 'cbz';
  }
  const fromPath = item.Path?.split('.').pop()?.toLowerCase();
  return fromPath && fromPath.length <= 4 ? fromPath : 'bin';
}

export interface BookFile {
  uri: string;
}

/**
 * The reader takes a URL, so on web a book is always "available" as long as we
 * have a session: the engine fetches it from the server as it reads.
 */
export function streamUrl(session: Session, item: BaseItem): string {
  const base = downloadUrl(session, item.Id);
  const token = encodeURIComponent(session.token);
  // Jellyfin 12 rejects the legacy `api_key` parameter with a 401 and only reads
  // `ApiKey`; older servers may only know `api_key`. Sending both works on each.
  return `${base}?ApiKey=${token}&api_key=${token}`;
}

/** Nothing is ever on disk in the browser build. */
export function localBookFile(_item: BaseItem): BookFile | null {
  return null;
}

export function isDownloaded(_itemId: string): boolean {
  return false;
}

export interface DownloadHandle {
  promise: Promise<BookFile>;
  cancel(): void;
}

/** The engine streams from the server, so there is nothing to fetch ahead. */
export function bookForReading(
  session: Session,
  item: BaseItem,
  _onProgress?: (fraction: number, bytes: number) => void,
): DownloadHandle {
  return { promise: Promise.resolve({ uri: streamUrl(session, item) }), cancel: () => {} };
}

/** Nothing is cached on disk in the browser build either. */
export function cacheSize(): number {
  return 0;
}

export function clearCache() {}

export function downloadBook(
  session: Session,
  item: BaseItem,
  _onProgress?: (fraction: number, bytes: number) => void,
): DownloadHandle {
  // Reading works without downloading, so this resolves to the streaming URL
  // instead of failing. Callers that specifically want an offline copy check
  // `canDownload` first.
  void formatOf(item);
  return bookForReading(session, item);
}

/** Lets the UI hide "Download" affordances that the browser cannot honour. */
export const canDownload = false;

export function deleteDownload(itemId: string) {
  forgetDownload(itemId);
}

export function downloadsSize(): number {
  return listDownloads().reduce((total, row) => total + (row.size || 0), 0);
}

export function clearAllDownloads() {
  for (const row of listDownloads()) forgetDownload(row.item_id);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}
