import * as Application from 'expo-application';
import * as Device from 'expo-device';

import type {
  AuthenticationResult,
  BaseItem,
  ItemsResponse,
  PublicSystemInfo,
  QuickConnectResult,
} from './types';

export const CLIENT_NAME = 'JellyShelf';
export const CLIENT_VERSION = Application.nativeApplicationVersion ?? '1.0.0';

export class JellyfinError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'JellyfinError';
  }
}

/** Trim trailing slashes and add a scheme if the user typed a bare host. */
export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!url) throw new JellyfinError('Enter a server address.');
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  url = url.replace(/\/+$/, '');
  // People paste the web client URL constantly; the API lives one level up.
  url = url.replace(/\/web(\/index\.html)?(#.*)?$/i, '');
  return url;
}

export interface Session {
  serverUrl: string;
  token: string;
  userId: string;
  userName: string;
  serverName?: string;
  deviceId: string;
}

/**
 * Jellyfin's auth header. Every request carries it — unauthenticated calls
 * (server probe, quick connect) still need the client identity fields.
 */
export function authHeader(deviceId: string, token?: string): string {
  const parts = [
    `Client="${CLIENT_NAME}"`,
    `Device="${(Device.modelName ?? 'iPhone').replace(/"/g, '')}"`,
    `DeviceId="${deviceId}"`,
    `Version="${CLIENT_VERSION}"`,
  ];
  if (token) parts.push(`Token="${token}"`);
  return `MediaBrowser ${parts.join(', ')}`;
}

type Query = Record<string, string | number | boolean | string[] | undefined | null>;

export function buildQuery(params: Query): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.append(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function request<T>(
  base: { serverUrl: string; deviceId: string; token?: string },
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', query, body, signal, timeoutMs = 20_000 } = options;
  const url = `${base.serverUrl}${path}${buildQuery(query ?? {})}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: authHeader(base.deviceId, base.token),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new JellyfinError(
        response.status === 401
          ? 'Your session expired. Sign in again.'
          : `Server returned ${response.status}.`,
        response.status,
      );
    }
    if (response.status === 204) return undefined as T;

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  } catch (error) {
    if (error instanceof JellyfinError) throw error;
    if ((error as Error)?.name === 'AbortError') {
      throw new JellyfinError("Couldn't reach the server — it timed out.");
    }
    throw new JellyfinError(
      "Couldn't reach the server. Check the address and that you're on the same network.",
      undefined,
      error,
    );
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Unauthenticated                                                     */
/* ------------------------------------------------------------------ */

export function probeServer(serverUrl: string, deviceId: string) {
  return request<PublicSystemInfo>({ serverUrl, deviceId }, '/System/Info/Public', { timeoutMs: 10_000 });
}

export function authenticateByName(
  serverUrl: string,
  deviceId: string,
  username: string,
  password: string,
) {
  return request<AuthenticationResult>({ serverUrl, deviceId }, '/Users/AuthenticateByName', {
    method: 'POST',
    body: { Username: username, Pw: password },
  });
}

export function quickConnectEnabled(serverUrl: string, deviceId: string) {
  return request<boolean>({ serverUrl, deviceId }, '/QuickConnect/Enabled', { timeoutMs: 8_000 });
}

export function quickConnectInitiate(serverUrl: string, deviceId: string) {
  return request<QuickConnectResult>({ serverUrl, deviceId }, '/QuickConnect/Initiate', { method: 'POST' });
}

export function quickConnectPoll(serverUrl: string, deviceId: string, secret: string) {
  return request<QuickConnectResult>({ serverUrl, deviceId }, '/QuickConnect/Connect', {
    query: { secret },
    timeoutMs: 8_000,
  });
}

export function authenticateWithQuickConnect(serverUrl: string, deviceId: string, secret: string) {
  return request<AuthenticationResult>({ serverUrl, deviceId }, '/Users/AuthenticateWithQuickConnect', {
    method: 'POST',
    body: { Secret: secret },
  });
}

/* ------------------------------------------------------------------ */
/* Authenticated                                                       */
/* ------------------------------------------------------------------ */

const ITEM_FIELDS = [
  'Overview',
  'Path',
  'Genres',
  'Tags',
  'SortName',
  'DateCreated',
  'ParentId',
  'People',
  'Studios',
  'MediaSources',
  'PrimaryImageAspectRatio',
];

export interface ItemQuery {
  parentId?: string;
  searchTerm?: string;
  sortBy?: string;
  sortOrder?: 'Ascending' | 'Descending';
  limit?: number;
  startIndex?: number;
  filters?: string;
  isPlayed?: boolean;
  isFavorite?: boolean;
  genres?: string[];
  years?: string;
  includeItemTypes?: string[];
  ids?: string[];
}

export function getBooks(session: Session, query: ItemQuery = {}, signal?: AbortSignal) {
  return request<ItemsResponse>(session, '/Items', {
    signal,
    query: {
      userId: session.userId,
      recursive: true,
      includeItemTypes: query.includeItemTypes ?? ['Book'],
      fields: ITEM_FIELDS,
      enableUserData: true,
      enableImageTypes: ['Primary', 'Backdrop'],
      imageTypeLimit: 1,
      enableTotalRecordCount: true,
      sortBy: query.sortBy ?? 'SortName',
      sortOrder: query.sortOrder ?? 'Ascending',
      parentId: query.parentId,
      searchTerm: query.searchTerm,
      limit: query.limit,
      startIndex: query.startIndex,
      filters: query.filters,
      isPlayed: query.isPlayed,
      isFavorite: query.isFavorite,
      genres: query.genres,
      years: query.years,
      ids: query.ids,
    },
  });
}

export function getItem(session: Session, itemId: string, signal?: AbortSignal) {
  return getBooks(session, { ids: [itemId], includeItemTypes: [] }, signal).then((res) => {
    const item = res.Items?.[0];
    if (!item) throw new JellyfinError('That book is no longer in your library.');
    return item;
  });
}

export function getBookLibraries(session: Session) {
  return request<ItemsResponse>(session, '/UserViews', {
    query: { userId: session.userId },
  }).then((res) => (res.Items ?? []).filter((v) => v.CollectionType === 'books'));
}

export function getGenres(session: Session, parentId?: string) {
  return request<ItemsResponse>(session, '/Genres', {
    query: { userId: session.userId, parentId, includeItemTypes: ['Book'], sortBy: 'SortName' },
  }).then((res) => res.Items ?? []);
}

/** Marks a book finished (or not) on the server. */
export function setPlayed(session: Session, itemId: string, played: boolean) {
  return request<unknown>(session, `/UserPlayedItems/${itemId}`, {
    method: played ? 'POST' : 'DELETE',
    query: { userId: session.userId },
  });
}

export function setFavorite(session: Session, itemId: string, favorite: boolean) {
  return request<unknown>(session, `/UserFavoriteItems/${itemId}`, {
    method: favorite ? 'POST' : 'DELETE',
    query: { userId: session.userId },
  });
}

/**
 * Jellyfin has no book-position concept, but UserItemData carries a generic
 * playback position we can borrow so progress follows you between devices.
 * `percent` is 0–1; we store it in ticks against a virtual 100% = 1e7 ticks.
 */
export const PROGRESS_SCALE_TICKS = 10_000_000;

export function pushProgress(session: Session, itemId: string, percent: number) {
  const clamped = Math.max(0, Math.min(1, percent));
  return request<unknown>(session, `/UserItems/${itemId}/UserData`, {
    method: 'POST',
    query: { userId: session.userId },
    body: {
      PlaybackPositionTicks: Math.round(clamped * PROGRESS_SCALE_TICKS),
      PlayedPercentage: clamped * 100,
      LastPlayedDate: new Date().toISOString(),
      Played: clamped >= 0.995,
    },
  });
}

export function serverProgressPercent(item: BaseItem): number {
  const ticks = item.UserData?.PlaybackPositionTicks ?? 0;
  if (item.UserData?.Played) return 1;
  if (!ticks) return 0;
  return Math.max(0, Math.min(1, ticks / PROGRESS_SCALE_TICKS));
}

/* ------------------------------------------------------------------ */
/* URLs (images / downloads are consumed by native loaders)            */
/* ------------------------------------------------------------------ */

export function imageUrl(
  session: Pick<Session, 'serverUrl'>,
  item: Pick<BaseItem, 'Id' | 'ImageTags'>,
  opts: { width?: number; height?: number; quality?: number; type?: string } = {},
): string | undefined {
  const type = opts.type ?? 'Primary';
  const tag = item.ImageTags?.[type];
  if (!tag) return undefined;
  return `${session.serverUrl}/Items/${item.Id}/Images/${type}${buildQuery({
    tag,
    quality: opts.quality ?? 90,
    fillWidth: opts.width ? Math.round(opts.width) : undefined,
    fillHeight: opts.height ? Math.round(opts.height) : undefined,
  })}`;
}

export function userImageUrl(session: Session, primaryImageTag?: string | null): string | undefined {
  if (!primaryImageTag) return undefined;
  return `${session.serverUrl}/Users/${session.userId}/Images/Primary${buildQuery({
    tag: primaryImageTag,
    quality: 90,
    fillWidth: 160,
    fillHeight: 160,
  })}`;
}

export function downloadUrl(session: Session, itemId: string): string {
  return `${session.serverUrl}/Items/${itemId}/Download`;
}

export function downloadHeaders(session: Session): Record<string, string> {
  return { Authorization: authHeader(session.deviceId, session.token) };
}
