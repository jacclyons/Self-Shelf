import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

import { downloadHeaders, downloadUrl, type Session } from '@/api/client';
import { isLocalId } from './localBooks';
import { formatOf, type BaseItem, type BookFormat } from '@/api/types';
import { forgetDownload, getDownload, kvGet, kvSet, listDownloads, recordDownload } from '@/state/db';

/**
 * Layout on disk:
 *
 *   Documents/                  <- WKWebView read-access root, and the folder
 *     <your own books>.epub        the Files app shows as "Self-Shelf"
 *     .jellyshelf/              <- dot-prefixed so Files keeps it out of sight
 *       engine/reader.html + vendored epub.js / pdf.js
 *       books/<itemId>.<ext>       Jellyfin downloads you asked to keep
 *       cache/<itemId>.<ext>       books fetched just to read, evicted oldest-first
 *
 * Everything lives under Documents so the reader can `fetch()` any book over
 * file:// from inside the WebView, whether it came from Jellyfin or from you.
 *
 * Reading and downloading are separate acts, the way they are in Jellyfin's
 * video clients: opening a book streams it into `cache/`, and only the
 * Download button pins a copy in `books/`. The cache is on Documents rather
 * than in the OS cache directory because the WebView can only read below its
 * one access root, so iOS never purges it for us; `trimCache` does instead.
 */
export const SHELF_ROOT = new Directory(Paths.document);
// Named before the Self-Shelf rename; renaming it would orphan existing downloads.
export const PRIVATE_DIR = new Directory(Paths.document, '.jellyshelf');
export const ENGINE_DIR = new Directory(PRIVATE_DIR, 'engine');
export const BOOKS_DIR = new Directory(PRIVATE_DIR, 'books');
export const CACHE_DIR = new Directory(PRIVATE_DIR, 'cache');

/** Comics run to a few hundred MB each, so this holds a handful of them. */
const CACHE_LIMIT = 1024 ** 3;
/** kv map of cache file name → when it was last opened, for the LRU order. */
const CACHE_OPENED_KEY = 'cache.opened';

/** Pre-file-sharing builds kept these in a visible `shelf/` folder. */
function migrateLegacyLayout() {
  const legacy = new Directory(Paths.document, 'shelf');
  if (!legacy.exists) return;
  try {
    legacy.delete();
  } catch {
    // Worst case the old folder lingers; the engine and books re-download.
  }
}

/** Bump when reader.html or a vendored library changes so devices re-copy. */
const ENGINE_VERSION = 9;
const ENGINE_VERSION_KEY = 'engine.version';

const ENGINE_FILES: { name: string; module: number }[] = [
  { name: 'reader.html', module: require('../../assets/reader/reader.html') },
  { name: 'unrar.js', module: require('../../assets/reader/unrar.jstxt') },
  { name: 'unrar.wasm', module: require('../../assets/reader/unrar.wasm') },
  { name: 'jszip.js', module: require('../../assets/reader/jszip.jstxt') },
  { name: 'epub.js', module: require('../../assets/reader/epub.jstxt') },
  { name: 'pdf.js', module: require('../../assets/reader/pdf.jstxt') },
  { name: 'pdfworker.js', module: require('../../assets/reader/pdfworker.jstxt') },
];

function ensureDir(dir: Directory) {
  if (!dir.exists) dir.create({ intermediates: true });
}

let enginePromise: Promise<string> | null = null;

/** Copies the reader engine out of the app bundle. Returns the reader.html URI. */
export function ensureReaderEngine(): Promise<string> {
  enginePromise ??= (async () => {
    migrateLegacyLayout();
    ensureDir(PRIVATE_DIR);
    ensureDir(ENGINE_DIR);
    ensureDir(BOOKS_DIR);
    ensureDir(CACHE_DIR);

    const html = new File(ENGINE_DIR, 'reader.html');
    // In development the engine is re-copied every time: editing reader.html and
    // forgetting to bump ENGINE_VERSION otherwise leaves a stale reader on disk,
    // which looks exactly like the change not working.
    const upToDate =
      !__DEV__ && kvGet<number>(ENGINE_VERSION_KEY, -1) === ENGINE_VERSION && html.exists;

    if (!upToDate) {
      for (const { name, module } of ENGINE_FILES) {
        const asset = Asset.fromModule(module);
        await asset.downloadAsync();
        if (!asset.localUri) throw new Error(`Could not unpack reader asset: ${name}`);

        const target = new File(ENGINE_DIR, name);
        if (target.exists) target.delete();
        new File(asset.localUri).copySync(target);
      }
      kvSet(ENGINE_VERSION_KEY, ENGINE_VERSION);
    }

    return html.uri;
  })();
  return enginePromise;
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

export function localBookFile(item: BaseItem): File | null {
  const row = getDownload(item.Id);
  if (!row) return null;
  const file = new File(row.uri);
  if (!file.exists) {
    forgetDownload(item.Id);
    return null;
  }
  return file;
}

export function isDownloaded(itemId: string): boolean {
  const row = getDownload(itemId);
  if (!row) return false;
  if (new File(row.uri).exists) return true;
  forgetDownload(itemId);
  return false;
}

/** Web cannot keep offline copies; native always can. */
export const canDownload = true;

export interface DownloadHandle {
  promise: Promise<File>;
  cancel(): void;
}

type ProgressFn = (fraction: number, bytes: number) => void;

function fileNameFor(item: BaseItem): string {
  return `${item.Id}.${extensionFor(formatOf(item), item)}`;
}

/** Fetches a Jellyfin item into `target`, replacing whatever was there. */
function fetchInto(
  session: Session,
  item: BaseItem,
  target: File,
  onProgress?: ProgressFn,
): DownloadHandle {
  if (target.exists) target.delete();
  const controller = new AbortController();
  const promise = File.downloadFileAsync(downloadUrl(session, item.Id), target, {
    headers: downloadHeaders(session),
    idempotent: true,
    signal: controller.signal,
    onProgress: ({ bytesWritten, totalBytes }) => {
      onProgress?.(totalBytes > 0 ? bytesWritten / totalBytes : 0, bytesWritten);
    },
  });
  return { promise, cancel: () => controller.abort() };
}

/* --------------------------------- cache -------------------------------- */

function cachedBookFile(item: BaseItem): File | null {
  const file = new File(CACHE_DIR, fileNameFor(item));
  return file.exists ? file : null;
}

function cacheOpened(): Record<string, number> {
  return kvGet<Record<string, number>>(CACHE_OPENED_KEY, {});
}

function touchCached(file: File) {
  kvSet(CACHE_OPENED_KEY, { ...cacheOpened(), [file.name]: Date.now() });
}

function cachedFiles(): File[] {
  if (!CACHE_DIR.exists) return [];
  return CACHE_DIR.list().filter((entry): entry is File => entry instanceof File);
}

/**
 * Drops the least recently opened books until the cache fits. `keep` is the
 * book being opened right now, which must survive even if it alone is over the
 * limit, or a single big comic could never be read.
 */
function trimCache(keep?: File) {
  const opened = cacheOpened();
  const files = cachedFiles()
    .filter((file) => file.uri !== keep?.uri)
    .sort((a, b) => (opened[a.name] ?? a.lastModified ?? 0) - (opened[b.name] ?? b.lastModified ?? 0));
  let total = files.reduce((sum, file) => sum + file.size, 0) + (keep?.size ?? 0);
  for (const file of files) {
    if (total <= CACHE_LIMIT) break;
    total -= file.size;
    try {
      file.delete();
    } catch {
      // A file we cannot remove just stays counted against the limit.
    }
    delete opened[file.name];
  }
  kvSet(CACHE_OPENED_KEY, opened);
}

/**
 * Gets a book onto disk so the reader can open it, preferring a pinned
 * download, then a cached copy, and only then the network. Nothing this fetches
 * shows as "Downloaded": it lands in the cache and is evicted when space is
 * needed.
 */
export function bookForReading(
  session: Session,
  item: BaseItem,
  onProgress?: ProgressFn,
): DownloadHandle {
  const pinned = localBookFile(item);
  if (pinned) return { promise: Promise.resolve(pinned), cancel: () => {} };

  ensureDir(PRIVATE_DIR);
  ensureDir(CACHE_DIR);

  const cached = cachedBookFile(item);
  if (cached) {
    touchCached(cached);
    return { promise: Promise.resolve(cached), cancel: () => {} };
  }

  const handle = fetchInto(session, item, new File(CACHE_DIR, fileNameFor(item)), onProgress);
  return {
    ...handle,
    promise: handle.promise.then((file) => {
      touchCached(file);
      trimCache(file);
      return file;
    }),
  };
}

export function cacheSize(): number {
  return cachedFiles().reduce((sum, file) => sum + file.size, 0);
}

export function clearCache() {
  if (CACHE_DIR.exists) {
    CACHE_DIR.delete();
    ensureDir(CACHE_DIR);
  }
  kvSet(CACHE_OPENED_KEY, {});
}

/* ------------------------------- downloads ------------------------------ */

/**
 * Pins a book to disk. Already-downloaded books resolve immediately, so this
 * doubles as "make sure I can open this offline". A book sitting in the cache
 * is moved across rather than fetched again.
 */
export function downloadBook(
  session: Session,
  item: BaseItem,
  onProgress?: ProgressFn,
): DownloadHandle {
  if (isLocalId(item.Id)) {
    return {
      promise: Promise.reject(new Error('This book is already stored on your iPhone.')),
      cancel: () => {},
    };
  }

  const existing = localBookFile(item);
  if (existing) {
    return { promise: Promise.resolve(existing), cancel: () => {} };
  }

  ensureDir(PRIVATE_DIR);
  ensureDir(BOOKS_DIR);

  const format = formatOf(item);
  const target = new File(BOOKS_DIR, fileNameFor(item));
  const record = (file: File) => {
    recordDownload({
      item_id: item.Id,
      uri: file.uri,
      format,
      size: file.size ?? 0,
      downloaded_at: Date.now(),
    });
    return file;
  };

  const cached = cachedBookFile(item);
  if (cached) {
    if (target.exists) target.delete();
    cached.moveSync(target);
    const opened = cacheOpened();
    delete opened[target.name];
    kvSet(CACHE_OPENED_KEY, opened);
    onProgress?.(1, target.size);
    return { promise: Promise.resolve(record(target)), cancel: () => {} };
  }

  const handle = fetchInto(session, item, target, onProgress);
  return { ...handle, promise: handle.promise.then(record) };
}

/** True only for paths inside our own downloads folder. */
function isManagedDownload(uri: string): boolean {
  const root = BOOKS_DIR.uri.replace(/\/?$/, '/');
  return uri.startsWith(root);
}

export function deleteDownload(itemId: string) {
  const row = getDownload(itemId);
  if (row) {
    // Never unlink anything outside the downloads folder. A book you added
    // yourself is yours; only the Files app should be able to remove it.
    if (isManagedDownload(row.uri)) {
      const file = new File(row.uri);
      if (file.exists) file.delete();
    }
  }
  forgetDownload(itemId);
}

export function downloadsSize(): number {
  return listDownloads().reduce((total, row) => total + (row.size || 0), 0);
}

export function clearAllDownloads() {
  for (const row of listDownloads()) deleteDownload(row.item_id);
  if (BOOKS_DIR.exists) {
    BOOKS_DIR.delete();
    ensureDir(BOOKS_DIR);
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}
