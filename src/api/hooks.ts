import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { Alert, AppState } from 'react-native';

import { isLocalId, localItem, localItems, scanLocalBooks } from '@/lib/localBooks';
import { useAuth } from '@/state/auth';
import {
  getAllProgress,
  markSynced,
  mergeServerProgress,
  pendingSync,
  saveProgress,
  setLocalFavorite,
} from '@/state/db';

import {
  getBookLibraries,
  getBooks,
  getGenres,
  pushProgress,
  serverProgressPercent,
  setFavorite,
  setPlayed,
  type ItemQuery,
  type Session,
} from './client';
import type { BaseItem, UserData } from './types';

const PAGE_SIZE = 60;

export function useLibraries() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['libraries', session?.serverUrl, session?.userId],
    queryFn: () => getBookLibraries(session!),
    enabled: !!session,
    staleTime: 10 * 60_000,
  });
}

export function useGenres(parentId?: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['genres', session?.userId, parentId],
    queryFn: () => getGenres(session!, parentId),
    enabled: !!session,
    staleTime: 10 * 60_000,
  });
}

/** A single, bounded shelf (Recently Added, Favorites, …). */
export function useShelf(key: string, query: ItemQuery, enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['shelf', key, session?.userId, query],
    queryFn: async ({ signal }) => {
      const res = await getBooks(session!, query, signal);
      const items = res.Items ?? [];
      for (const item of items) {
        const percent = serverProgressPercent(item);
        if (percent > 0) mergeServerProgress(item.Id, percent, !!item.UserData?.Played);
      }
      return items;
    },
    enabled: !!session && enabled,
    staleTime: 60_000,
  });
}

/** The full library grid, paged as you scroll. */
export function useLibraryBooks(query: ItemQuery) {
  const { session } = useAuth();
  return useInfiniteQuery({
    queryKey: ['library', session?.userId, query],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const res = await getBooks(
        session!,
        { ...query, startIndex: pageParam, limit: PAGE_SIZE },
        signal,
      );
      const items = res.Items ?? [];
      for (const item of items) {
        const percent = serverProgressPercent(item);
        if (percent > 0) mergeServerProgress(item.Id, percent, !!item.UserData?.Played);
      }
      return { items, total: res.TotalRecordCount ?? items.length, startIndex: pageParam };
    },
    getNextPageParam: (last) => {
      const next = last.startIndex + last.items.length;
      return next < last.total && last.items.length > 0 ? next : undefined;
    },
    enabled: !!session,
    staleTime: 60_000,
  });
}

/** Books sitting in the app's Files folder, rescanned whenever we come back. */
export function useLocalBooks() {
  const query = useQuery({
    queryKey: ['local-books'],
    queryFn: async () => {
      scanLocalBooks();
      return localItems();
    },
    staleTime: 5_000,
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      // Files may have been added from the Files app while we were away.
      if (next === 'active') query.refetch();
    });
    return () => sub.remove();
  }, [query]);

  return query;
}

export function useBook(itemId?: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['book', session?.userId, itemId],
    queryFn: async ({ signal }) => {
      if (itemId && isLocalId(itemId)) {
        const local = localItem(itemId);
        if (!local) throw new Error('That file is no longer in your JellyShelf folder.');
        return local;
      }
      const res = await getBooks(session!, { ids: [itemId!], includeItemTypes: [] }, signal);
      const item = res.Items?.[0];
      if (!item) throw new Error('That book is no longer in your library.');
      const percent = serverProgressPercent(item);
      if (percent > 0) mergeServerProgress(item.Id, percent, !!item.UserData?.Played);
      return item;
    },
    enabled: (!!session || !!(itemId && isLocalId(itemId))) && !!itemId,
    staleTime: 60_000,
  });
}

/** Books you have actually started, newest touch first, hydrated from the server. */
export function useContinueReading() {
  const { session } = useAuth();
  const rows = getAllProgress().filter((row) => row.percent > 0.001 && !row.finished);
  const ids = rows.slice(0, 12).map((row) => row.item_id);

  return useQuery({
    queryKey: ['continue', session?.userId, ids.join(',')],
    queryFn: async ({ signal }) => {
      if (!ids.length) return [] as BaseItem[];
      const res = await getBooks(session!, { ids, includeItemTypes: [] }, signal);
      const order = new Map(ids.map((id, index) => [id, index]));
      return (res.Items ?? []).sort(
        (a, b) => (order.get(a.Id) ?? 99) - (order.get(b.Id) ?? 99),
      );
    },
    enabled: !!session,
    staleTime: 30_000,
  });
}

/** Every cache that can hold a BaseItem, in each of the shapes we store them. */
const ITEM_QUERY_KEYS = ['shelf', 'library', 'continue', 'book', 'local-books'] as const;

function applyPatch(item: BaseItem, itemId: string, patch: Partial<UserData>): BaseItem {
  if (item.Id !== itemId) return item;
  return { ...item, UserData: { ...(item.UserData ?? {}), ...patch } };
}

/**
 * Writes a UserData change straight into every cached shape so the toggle is
 * reflected immediately, wherever the book happens to be on screen.
 */
function patchItemEverywhere(
  client: ReturnType<typeof useQueryClient>,
  itemId: string,
  patch: Partial<UserData>,
) {
  for (const key of ITEM_QUERY_KEYS) {
    client.setQueriesData({ queryKey: [key] }, (data: unknown) => {
      if (!data) return data;

      // useShelf / useContinueReading: BaseItem[]
      if (Array.isArray(data)) {
        return (data as BaseItem[]).map((entry) => applyPatch(entry, itemId, patch));
      }

      // useLibraryBooks: InfiniteData<{ items: BaseItem[] }>
      const paged = data as { pages?: { items?: BaseItem[] }[] };
      if (paged.pages) {
        return {
          ...paged,
          pages: paged.pages.map((page) => ({
            ...page,
            items: (page.items ?? []).map((entry) => applyPatch(entry, itemId, patch)),
          })),
        };
      }

      // useBook: a single BaseItem
      const single = data as BaseItem;
      if (single.Id) return applyPatch(single, itemId, patch);

      return data;
    });
  }
}

function invalidateItemQueries(client: ReturnType<typeof useQueryClient>) {
  for (const key of ITEM_QUERY_KEYS) client.invalidateQueries({ queryKey: [key] });
}

export function useToggleFavorite() {
  const { session } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, favorite }: { item: BaseItem; favorite: boolean }) => {
      if (isLocalId(item.Id)) {
        setLocalFavorite(item.Id, favorite);
        return;
      }
      await setFavorite(session!, item.Id, favorite);
    },
    onMutate: ({ item, favorite }) => {
      patchItemEverywhere(client, item.Id, { IsFavorite: favorite });
    },
    onError: (error, { item, favorite }) => {
      patchItemEverywhere(client, item.Id, { IsFavorite: !favorite });
      Alert.alert("Couldn't update", (error as Error).message ?? 'Please try again.');
    },
    onSettled: () => invalidateItemQueries(client),
  });
}

export function useToggleFinished() {
  const { session } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, finished }: { item: BaseItem; finished: boolean }) => {
      saveProgress(item.Id, finished ? 1 : 0, null, finished);
      if (isLocalId(item.Id)) {
        markSynced(item.Id);
        return;
      }
      await setPlayed(session!, item.Id, finished);
      markSynced(item.Id);
    },
    onMutate: ({ item, finished }) => {
      patchItemEverywhere(client, item.Id, {
        Played: finished,
        PlayedPercentage: finished ? 100 : 0,
      });
    },
    onError: (error, { item, finished }) => {
      patchItemEverywhere(client, item.Id, { Played: !finished });
      Alert.alert("Couldn't update", (error as Error).message ?? 'Please try again.');
    },
    onSettled: () => invalidateItemQueries(client),
  });
}

/**
 * Flushes locally-recorded reading positions to Jellyfin. Runs on foreground
 * and after the reader closes; failures are simply retried next time.
 */
export function useProgressSync() {
  const { session } = useAuth();

  const flush = useCallback(async () => {
    if (!session) return;
    for (const row of pendingSync()) {
      if (isLocalId(row.item_id)) {
        markSynced(row.item_id);
        continue;
      }
      try {
        await pushProgress(session, row.item_id, row.percent);
        markSynced(row.item_id);
      } catch {
        break;
      }
    }
  }, [session]);

  useEffect(() => {
    flush();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') flush();
    });
    return () => sub.remove();
  }, [flush]);

  return flush;
}

export type { Session };
