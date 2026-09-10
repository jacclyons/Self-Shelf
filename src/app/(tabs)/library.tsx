import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ItemQuery } from '@/api/client';
import { useLibraries, useLibraryBooks, useLocalBooks } from '@/api/hooks';
import type { BaseItem } from '@/api/types';
import { useAuth } from '@/state/auth';
import { showAlert } from '@/lib/alert';
import { canImport, importBooks } from '@/lib/localBooks';
import { isDownloaded } from '@/lib/storage';
import { Chip, EmptyState, Icon } from '@/ui/Bits';
import { GlassSurface } from '@/ui/Glass';
import { Press } from '@/ui/Press';
import { BookTile } from '@/ui/Shelf';
import { contentColumn, maxContentWidth, radius, tabBarInset, type as type_, useTheme } from '@/ui/theme';

type SortKey = 'SortName' | 'DateCreated' | 'CommunityRating' | 'ProductionYear';

const SORTS: { key: SortKey; label: string; order: 'Ascending' | 'Descending' }[] = [
  { key: 'SortName', label: 'Title', order: 'Ascending' },
  { key: 'DateCreated', label: 'Recently Added', order: 'Descending' },
  { key: 'ProductionYear', label: 'Year', order: 'Descending' },
  { key: 'CommunityRating', label: 'Rating', order: 'Descending' },
];

type Filter = 'all' | 'reading' | 'unread' | 'favorites' | 'downloaded';

const FILTERS: { key: Filter; label: string; icon?: Parameters<typeof Icon>[0]['name'] }[] = [
  { key: 'all', label: 'All' },
  { key: 'reading', label: 'Reading' },
  { key: 'unread', label: 'Unread' },
  { key: 'favorites', label: 'Readlist', icon: 'heart.fill' },
  { key: 'downloaded', label: 'Downloaded', icon: 'arrow.down.circle.fill' },
];

/** Books come from the server, from the Files folder, or both. */
type Source = 'all' | 'jellyfin' | 'local';

export default function Library() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const { width } = useWindowDimensions();

  const [sort, setSort] = useState<SortKey>('SortName');
  const [filter, setFilter] = useState<Filter>('all');
  const [libraryId, setLibraryId] = useState<string | undefined>();
  const [source, setSource] = useState<Source>('all');
  const [importing, setImporting] = useState(false);

  const libraries = useLibraries();
  const local = useLocalBooks();

  const query = useMemo<ItemQuery>(() => {
    const chosen = SORTS.find((s) => s.key === sort)!;
    return {
      sortBy: sort,
      sortOrder: chosen.order,
      parentId: libraryId,
      isFavorite: filter === 'favorites' ? true : undefined,
      isPlayed: filter === 'unread' ? false : undefined,
    };
  }, [filter, libraryId, sort]);

  const books = useLibraryBooks(query);

  const items = useMemo(() => {
    const server = source === 'local' ? [] : (books.data?.pages.flatMap((page) => page.items) ?? []);
    const onDevice = source === 'jellyfin' ? [] : (local.data ?? []);

    let all = [...onDevice, ...server];
    if (filter === 'downloaded') {
      // Files in the Self-Shelf folder are already on the device by definition.
      all = all.filter((item) => item.Id.startsWith('local:') || isDownloaded(item.Id));
    } else if (filter === 'favorites') {
      all = all.filter((item) => item.UserData?.IsFavorite);
    } else if (filter === 'unread') {
      all = all.filter((item) => !item.UserData?.Played);
    } else if (filter === 'reading') {
      all = all.filter((item) => {
        const percent = item.UserData?.PlayedPercentage ?? 0;
        return percent > 0.5 && !item.UserData?.Played;
      });
    }
    return all;
  }, [books.data, filter, local.data, source]);

  // Three columns on a phone, more as the window grows (iPad, Stage Manager).
  // The grid is laid out against the content column, not the window, so a wide
  // browser gets a readable grid rather than a dozen tiny columns.
  const gridWidth = Math.min(width, maxContentWidth);
  const columns = Math.max(3, Math.floor(gridWidth / 132));
  const gutter = 18;
  const tileWidth = (gridWidth - gutter * (columns + 1)) / columns;

  const loadMore = useCallback(() => {
    if (books.hasNextPage && !books.isFetchingNextPage) books.fetchNextPage();
  }, [books]);

  if (!session) return null;

  const serverTotal = books.data?.pages[0]?.total ?? 0;
  const localTotal = local.data?.length ?? 0;
  const total = source === 'local' ? localTotal : source === 'jellyfin' ? serverTotal : serverTotal + localTotal;

  const runImport = async () => {
    setImporting(true);
    try {
      const count = await importBooks();
      await local.refetch();
      if (count === 0) return;
      showAlert(
        'Added to your shelf',
        `${count} book${count === 1 ? '' : 's'} copied into the Self-Shelf folder.`,
      );
    } catch (error) {
      showAlert("Couldn't import", (error as Error).message ?? 'Please try again.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <FlatList
        data={items}
        key={columns}
        numColumns={columns}
        keyExtractor={(item: BaseItem) => item.Id}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          contentColumn,
          {
            paddingTop: insets.top + 8 + tabBarInset,
            paddingBottom: insets.bottom + 130,
            paddingHorizontal: gutter,
          },
        ]}
        columnWrapperStyle={columns > 1 ? { gap: gutter } : undefined}
        ItemSeparatorComponent={() => <View style={{ height: 26 }} />}
        onEndReached={loadMore}
        onEndReachedThreshold={1.2}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={{ marginBottom: 22 }}>
            <Text style={[type_.largeTitle, { color: theme.text, letterSpacing: -0.9 }]}>
              Library
            </Text>
            <Text style={[type_.footnote, { color: theme.textTertiary, marginTop: 2 }]}>
              {total ? `${total} book${total === 1 ? '' : 's'}` : ' '}
            </Text>

            {libraries.data && libraries.data.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 14, paddingRight: 20 }}
              >
                <Chip
                  label="All Libraries"
                  selected={!libraryId}
                  onPress={() => setLibraryId(undefined)}
                />
                {libraries.data.map((lib) => (
                  <Chip
                    key={lib.Id}
                    label={lib.Name ?? 'Books'}
                    selected={libraryId === lib.Id}
                    onPress={() => setLibraryId(lib.Id)}
                  />
                ))}
              </ScrollView>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingTop: 14, paddingRight: 20 }}
            >
              <Chip label="All Sources" selected={source === 'all'} onPress={() => setSource('all')} />
              <Chip
                label="Jellyfin"
                icon="server.rack"
                selected={source === 'jellyfin'}
                onPress={() => setSource('jellyfin')}
              />
              {canImport ? (
                <>
                  <Chip
                    label="On This iPhone"
                    icon="iphone"
                    selected={source === 'local'}
                    onPress={() => setSource('local')}
                  />
                  <Chip
                    label={importing ? 'Importing…' : 'Import…'}
                    icon="plus"
                    onPress={runImport}
                  />
                </>
              ) : null}
            </ScrollView>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingTop: 10, paddingRight: 20 }}
            >
              {FILTERS.map((f) => (
                <Chip
                  key={f.key}
                  label={f.label}
                  icon={f.icon}
                  selected={filter === f.key}
                  onPress={() => setFilter(f.key)}
                />
              ))}
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => (
          <BookTile item={item} session={session} width={tileWidth} />
        )}
        ListEmptyComponent={
          books.isPending ? (
            <View style={{ paddingTop: 60 }}>
              <ActivityIndicator color={theme.textTertiary} />
            </View>
          ) : (
            <EmptyState
              icon={filter === 'downloaded' ? 'arrow.down.circle' : 'books.vertical'}
              title={filter === 'all' ? 'No books found' : 'Nothing here yet'}
              message={
                filter === 'downloaded'
                  ? 'Books you download for offline reading will show up here.'
                  : books.error
                    ? String((books.error as Error).message)
                    : 'Check that your Jellyfin library uses the Books content type.'
              }
              action={filter !== 'all' ? 'Show all books' : undefined}
              onAction={() => setFilter('all')}
            />
          )
        }
        ListFooterComponent={
          books.isFetchingNextPage ? (
            <View style={{ paddingVertical: 26 }}>
              <ActivityIndicator color={theme.textTertiary} />
            </View>
          ) : null
        }
      />

      {/* Floating glass sort control — the one persistent chrome element. */}
      <View
        style={{
          position: 'absolute',
          right: 18,
          bottom: insets.bottom + 84,
        }}
      >
        <SortButton sort={sort} onChange={setSort} />
      </View>
    </View>
  );
}

function SortButton({ sort, onChange }: { sort: SortKey; onChange: (key: SortKey) => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ alignItems: 'flex-end', gap: 8 }}>
      {open ? (
        <GlassSurface
          radius={radius.lg}
          style={{ borderRadius: radius.lg, overflow: 'hidden', minWidth: 190 }}
        >
          {SORTS.map((option, index) => (
            <Press
              key={option.key}
              haptic="selection"
              scaleTo={0.98}
              onPress={() => {
                onChange(option.key);
                setOpen(false);
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 13,
                  borderTopWidth: index === 0 ? 0 : 0.5,
                  borderTopColor: theme.separator,
                }}
              >
                <Text style={[type_.subhead, { color: theme.text }]}>{option.label}</Text>
                {sort === option.key ? (
                  <Icon name="checkmark" size={14} color={theme.tint} />
                ) : null}
              </View>
            </Press>
          ))}
        </GlassSurface>
      ) : null}

      <Press onPress={() => setOpen((v) => !v)} haptic="light" scaleTo={0.9}>
        <GlassSurface
          interactive
          radius={radius.pill}
          style={{
            width: 50,
            height: 50,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: theme.shadow,
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 5 },
          }}
        >
          <Icon
            name={open ? 'xmark' : 'arrow.up.arrow.down'}
            size={18}
            color={theme.text}
          />
        </GlassSurface>
      </Press>
    </View>
  );
}
