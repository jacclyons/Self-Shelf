/** Minimal, hand-written slice of the Jellyfin API surface JellyShelf actually uses. */

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

/** Every extension Jellyfin's bookshelf plugin recognises for the `Book` type. */
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

export const TICKS_PER_MS = 10_000;
