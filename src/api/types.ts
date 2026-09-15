/** Minimal, hand-written slice of the Jellyfin API surface Self-Shelf actually uses. */

export type ItemType = 'Book' | 'AudioBook' | 'Folder' | 'CollectionFolder';

export interface UserData {
  PlaybackPositionTicks?: number;
  PlayCount?: number;
  IsFavorite?: boolean;
  Played?: boolean;
  PlayedPercentage?: number | null;
  LastPlayedDate?: string | null;
}

export interface BaseItem {
  Id: string;
  Name?: string | null;
  SortName?: string | null;
  Type?: string | null;
  Overview?: string | null;
  ProductionYear?: number | null;
  PremiereDate?: string | null;
  DateCreated?: string | null;
  Path?: string | null;
  Container?: string | null;
  ParentId?: string | null;
  SeriesName?: string | null;
  IndexNumber?: number | null;
  Genres?: string[] | null;
  Tags?: string[] | null;
  CommunityRating?: number | null;
  RunTimeTicks?: number | null;
  CollectionType?: string | null;
  ChildCount?: number | null;
  PrimaryImageAspectRatio?: number | null;
  ImageTags?: Record<string, string> | null;
  BackdropImageTags?: string[] | null;
  ImageBlurHashes?: Record<string, Record<string, string>> | null;
  UserData?: UserData | null;
  /** App-side only: cover art on disk, for books not backed by a server. */
  LocalCoverUri?: string | null;
  AlbumArtist?: string | null;
  People?: { Name?: string | null; Role?: string | null; Type?: string | null; Id?: string }[] | null;
  Studios?: { Name?: string | null; Id?: string }[] | null;
  MediaSources?: { Id?: string; Path?: string | null; Size?: number | null; Container?: string | null }[] | null;
  /**
   * IDs the metadata fetchers stamp on a book, keyed by provider: `GoogleBooks`
   * and `ComicVine` from the Jellyfin 12 plugins of the same names (and the
   * old Bookshelf plugin before them), plus whatever a user types in by hand.
   */
  ProviderIds?: Record<string, string | null> | null;
  /** Links the server builds from `ProviderIds`; needs the `ExternalUrls` field. */
  ExternalUrls?: { Name?: string | null; Url?: string | null }[] | null;
}

export interface ItemsResponse {
  Items?: BaseItem[] | null;
  TotalRecordCount?: number;
  StartIndex?: number;
}

export interface PublicSystemInfo {
  LocalAddress?: string | null;
  ServerName?: string | null;
  Version?: string | null;
  ProductName?: string | null;
  Id?: string | null;
  StartupWizardCompleted?: boolean | null;
}

export interface AuthenticationResult {
  User?: { Id: string; Name?: string | null; PrimaryImageTag?: string | null; ServerId?: string | null } | null;
  AccessToken?: string | null;
  ServerId?: string | null;
}

export interface QuickConnectResult {
  Authenticated?: boolean;
  Secret?: string | null;
  Code?: string | null;
}

/**
 * Every extension Jellyfin's `Book` type recognises. Book support is built into
 * the server from Jellyfin 12; older servers get the same list from the
 * Bookshelf plugin.
 */
export const BOOK_EXTENSIONS = [
  'epub', 'pdf', 'azw', 'azw3', 'mobi', 'cbz', 'cbr', 'cb7', 'cbt', 'zip', 'rar', '7z',
] as const;

export type BookFormat = 'epub' | 'pdf' | 'comic' | 'comic-unsupported' | 'unsupported';

/** Comic archives we can open: ZIP via JSZip, RAR via the bundled unrar wasm. */
const COMIC_READABLE = ['cbz', 'zip', 'cbr', 'rar'];
/** 7z and tar-based comics would each need another decoder. */
const COMIC_OTHER = ['cb7', 'cbt', '7z'];

export function formatOf(item: Pick<BaseItem, 'Container' | 'Path'>): BookFormat {
  const raw = (item.Container || item.Path?.split('.').pop() || '').toLowerCase().replace(/^\./, '');
  // Jellyfin sometimes reports a comma-separated container list.
  const ext = raw.split(',')[0]?.trim() ?? '';
  if (ext === 'epub') return 'epub';
  if (ext === 'pdf') return 'pdf';
  if (COMIC_READABLE.includes(ext)) return 'comic';
  if (COMIC_OTHER.includes(ext)) return 'comic-unsupported';
  return 'unsupported';
}

export function isReadable(format: BookFormat): boolean {
  return format === 'epub' || format === 'pdf' || format === 'comic';
}

/** What the reader engine should do with it. */
export function engineKindFor(format: BookFormat): 'epub' | 'pdf' | 'comic' {
  if (format === 'pdf') return 'pdf';
  if (format === 'comic') return 'comic';
  return 'epub';
}

/** Jellyfin models authors as People; sideloaded books fall back to Studios. */
export function authorOf(item: BaseItem): string | undefined {
  const person = item.People?.find((p) => p.Type === 'Author' || p.Type === 'Writer');
  return person?.Name ?? item.Studios?.[0]?.Name ?? item.AlbumArtist ?? undefined;
}

export interface ExternalLink {
  name: string;
  url: string;
}

/**
 * Where a provider stores its ID but the server doesn't build a link for it.
 * Jellyfin 12 servers send `ExternalUrls` for the ComicVine and GoogleBooks
 * plugins already; this covers older servers and an ISBN typed in by hand.
 */
const PROVIDER_LINKS: Record<string, (id: string) => ExternalLink> = {
  googlebooks: (id) => ({ name: 'Google Books', url: `https://books.google.com/books?id=${id}` }),
  comicvine: (id) => ({ name: 'Comic Vine', url: `https://comicvine.gamespot.com/${id}` }),
  openlibrary: (id) => ({ name: 'Open Library', url: `https://openlibrary.org${id.startsWith('/') ? id : `/works/${id}`}` }),
  isbn: (id) => ({ name: 'Open Library', url: `https://openlibrary.org/isbn/${id.replace(/[^0-9Xx]/g, '')}` }),
};

/**
 * Links out to the metadata source for a book, one per site. The server's own
 * `ExternalUrls` come first; anything it left out is built from `ProviderIds`.
 */
export function externalLinksOf(item: BaseItem): ExternalLink[] {
  const links: ExternalLink[] = [];
  const seen = new Set<string>();
  const add = (link: ExternalLink) => {
    if (seen.has(link.name)) return;
    seen.add(link.name);
    links.push(link);
  };
  for (const entry of item.ExternalUrls ?? []) {
    if (entry?.Name && entry.Url) add({ name: entry.Name, url: entry.Url });
  }
  for (const [key, id] of Object.entries(item.ProviderIds ?? {})) {
    const build = PROVIDER_LINKS[key.toLowerCase()];
    if (build && id) add(build(id));
  }
  return links;
}

export const TICKS_PER_MS = 10_000;
