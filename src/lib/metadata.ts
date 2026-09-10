import { Directory, File } from 'expo-file-system';

import { enrichLocalBook, getLocalBook } from '@/state/db';

import { PRIVATE_DIR } from './storage';

/**
 * Metadata for sideloaded books. Open Library is tried first (richer book
 * coverage, permissive terms) with Google Books as a fallback — both throttle
 * aggressively, and a lookup failing because one provider is rate-limiting is
 * not a reason to give up.
 */
const OPEN_LIBRARY = 'https://openlibrary.org/search.json';
const OPEN_LIBRARY_COVERS = 'https://covers.openlibrary.org/b/id';
const GOOGLE_BOOKS = 'https://www.googleapis.com/books/v1/volumes';

/** Open Library asks clients to identify themselves; unidentified ones get throttled harder. */
const USER_AGENT = 'Self-Shelf/1.0 (book reader; +https://jellyshelf.vercel.app)';

export interface MetadataMatch {
  key: string;
  title: string;
  author: string | null;
  year: number | null;
  coverThumb: string | null;
  coverFull: string | null;
  publisher: string | null;
  source: 'Open Library' | 'Google Books';
}

class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });

    // Report the actual status rather than blaming the connection.
    if (response.status === 429) {
      throw new ProviderError('rate limited', true);
    }
    if (!response.ok) {
      throw new ProviderError(`returned ${response.status}`, false);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if ((error as Error)?.name === 'AbortError') throw new ProviderError('timed out', true);
    throw new ProviderError('unreachable', true);
  } finally {
    clearTimeout(timer);
  }
}

interface OpenLibraryDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  publisher?: string[];
}

async function searchOpenLibrary(query: string, signal?: AbortSignal): Promise<MetadataMatch[]> {
  const url = `${OPEN_LIBRARY}?q=${encodeURIComponent(query)}&limit=12&fields=key,title,author_name,first_publish_year,cover_i,publisher`;
  const json = (await getJson(url, signal)) as { docs?: OpenLibraryDoc[] };

  return (json.docs ?? []).map((doc, index) => ({
    key: doc.key ?? `ol-${index}`,
    title: doc.title ?? 'Untitled',
    author: doc.author_name?.[0] ?? null,
    year: doc.first_publish_year ?? null,
    coverThumb: doc.cover_i ? `${OPEN_LIBRARY_COVERS}/${doc.cover_i}-M.jpg` : null,
    coverFull: doc.cover_i ? `${OPEN_LIBRARY_COVERS}/${doc.cover_i}-L.jpg` : null,
    publisher: doc.publisher?.[0] ?? null,
    source: 'Open Library' as const,
  }));
}

interface GoogleVolume {
  id?: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    publisher?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
}

async function searchGoogleBooks(query: string, signal?: AbortSignal): Promise<MetadataMatch[]> {
  const url = `${GOOGLE_BOOKS}?q=${encodeURIComponent(query)}&maxResults=12&printType=books`;
  const json = (await getJson(url, signal)) as { items?: GoogleVolume[] };

  return (json.items ?? []).map((volume, index) => {
    const info = volume.volumeInfo ?? {};
    const thumb = (info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail)?.replace(
      /^http:/,
      'https:',
    );
    return {
      key: volume.id ?? `gb-${index}`,
      title: [info.title, info.subtitle].filter(Boolean).join(': ') || 'Untitled',
      author: info.authors?.[0] ?? null,
      year: info.publishedDate ? Number.parseInt(info.publishedDate.slice(0, 4), 10) || null : null,
      coverThumb: thumb ?? null,
      // zoom=2 is roughly twice the default edge length.
      coverFull: thumb ? thumb.replace(/zoom=\d/, 'zoom=2') : null,
      publisher: info.publisher ?? null,
      source: 'Google Books' as const,
    };
  });
}

export async function searchMetadata(query: string, signal?: AbortSignal): Promise<MetadataMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const failures: string[] = [];

  for (const [name, search] of [
    ['Open Library', searchOpenLibrary],
    ['Google Books', searchGoogleBooks],
  ] as const) {
    try {
      const results = await search(trimmed, signal);
      if (results.length) return results;
      failures.push(`${name}: no matches`);
    } catch (error) {
      failures.push(`${name} ${(error as Error).message}`);
    }
  }

  // Every provider failed: say which, and whether waiting will help.
  const rateLimited = failures.some((f) => f.includes('rate limited'));
  if (rateLimited) {
    throw new Error('Rate-limited by the metadata services. Wait a minute and try again.');
  }
  if (failures.every((f) => f.endsWith('no matches'))) {
    return [];
  }
  throw new Error(`Couldn't look this up (${failures.join('; ')}).`);
}

/** A sensible opening query from whatever we already know about the file. */
export function suggestedQuery(title: string, author: string | null): string {
  const cleaned = title
    .replace(/\((?:[^)]*)\)/g, ' ')
    .replace(/\b(epub|pdf|retail|unabridged|v\d+)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return author ? `${cleaned} ${author}` : cleaned;
}

/** Saves the chosen match, pulling the cover down for offline use. */
export async function applyMetadata(itemId: string, match: MetadataMatch): Promise<void> {
  const row = getLocalBook(itemId);
  if (!row) throw new Error('That book is no longer on this iPhone.');

  let coverUri: string | null = row.cover_uri;

  if (match.coverFull) {
    const covers = new Directory(PRIVATE_DIR, 'covers');
    if (!covers.exists) covers.create({ intermediates: true });

    const target = new File(covers, `${itemId.replace(/[^a-z0-9]/gi, '_')}.jpg`);
    if (target.exists) target.delete();

    try {
      const file = await File.downloadFileAsync(match.coverFull, target, { idempotent: true });
      // Open Library serves a 1x1 placeholder when it has no real cover.
      coverUri = (file.size ?? 0) > 2048 ? file.uri : coverUri;
    } catch {
      // Keep the text metadata even if the cover download fails.
    }
  }

  enrichLocalBook(itemId, { title: match.title, author: match.author, coverUri });
}

export function clearMetadataCover(itemId: string) {
  const row = getLocalBook(itemId);
  if (!row?.cover_uri) return;
  const file = new File(row.cover_uri);
  if (file.exists) file.delete();
  enrichLocalBook(itemId, { coverUri: null });
}
