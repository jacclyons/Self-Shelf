import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ItemQuery } from '@/api/client';
import { useLibraries, useLibraryBooks, useLocalBooks } from '@/api/hooks';
import type { BaseItem } from '@/api/types';
import { useAuth } from '@/state/auth';
import { kvGet, kvSet } from '@/state/db';
import { showAlert } from '@/lib/alert';
import { canImport, importBooks } from '@/lib/localBooks';
import { isDownloaded } from '@/lib/storage';
import { AmbientBackdrop } from '@/ui/AmbientBackdrop';
import { Chip, EmptyState, Icon } from '@/ui/Bits';
import { GlassSurface } from '@/ui/Glass';
import { Press } from '@/ui/Press';
import { BookTile } from '@/ui/Shelf';
import { ShelfCarousel } from '@/ui/ShelfCarousel';
import { contentColumn, maxContentWidth, radius, serif, tabBarInset, type as type_, useTheme } from '@/ui/theme';

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

/** A wall of covers to scan, or a shelf to browse one book at a time. */
type Layout = 'grid' | 'shelf';

/** The shelf is the default; a switch to the grid is remembered across launches. */
const LAYOUT_KEY = 'library.layout.v1';

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
  const [layout, setLayoutState] = useState<Layout>(() =>
    kvGet<Layout>(LAYOUT_KEY, 'shelf') === 'grid' ? 'grid' : 'shelf',
  );
  const setLayout = useCallback((next: Layout) => {
    setLayoutState(next);
    kvSet(LAYOUT_KEY, next);
  }, []);
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

  const header = (
    <View style={{ marginBottom: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View>
          <Text
            style={[
              type_.largeTitle,
              { fontFamily: serif, color: theme.text, letterSpacing: -0.4 },
            ]}
          >
            Library
          </Text>
          <Text style={[type_.footnote, { color: theme.textTertiary, marginTop: 2 }]}>
            {total ? `${total} book${total === 1 ? '' : 's'}` : ' '}
          </Text>
        </View>
        {/*
          The sort control sits in the header on web, where there is no tab
          bar along the bottom for a floating button to line up with. The
          menu drops down over whatever follows, so the row sits above it.
        */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, zIndex: 20 }}>
          {Platform.OS === 'web' ? (
            <SortButton sort={sort} onChange={setSort} placement="header" />
          ) : null}
          <LayoutToggle layout={layout} onChange={setLayout} />
        </View>
      </View>

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
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AmbientBackdrop />
      {layout === 'shelf' ? (
        <View
          style={[
            contentColumn,
            {
              flex: 1,
              paddingTop: insets.top + 8 + tabBarInset,
              paddingBottom: insets.bottom + 100,
              paddingHorizontal: gutter,
            },
          ]}
        >
          {header}
          {items.length ? (
            // The shelf ignores the side padding so spines can run off screen.
            <View style={{ flex: 1, marginHorizontal: -gutter }}>
              <ShelfCarousel items={items} session={session} onNearEnd={loadMore} />
            </View>
          ) : books.isPending ? (
            <View style={{ paddingTop: 60 }}>
              <ActivityIndicator color={theme.textTertiary} />
            </View>
          ) : (
            <EmptyState
              icon={filter === 'downloaded' ? 'arrow.down.circle' : 'books.vertical'}
              title={filter === 'all' ? 'No books found' : 'Nothing here yet'}
              action={filter !== 'all' ? 'Show all books' : undefined}
              onAction={() => setFilter('all')}
            />
          )}
        </View>
      ) : (
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
          ListHeaderComponent={header}
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
      )}

      {/*
        Floating glass sort control — the one persistent chrome element. It's
        the same size as the tab bar's search circle and sits just left of it,
        so the bottom edge reads as one row of round buttons. The offsets were
        measured against the iOS 26 bar: the screen's view ends above the bar,
        so the button hangs below its bottom edge to line up. On web it lives
        in the header instead.
      */}
      {Platform.OS !== 'web' ? (
        <View style={{ position: 'absolute', right: 90, bottom: insets.bottom - 61 }}>
          <SortButton sort={sort} onChange={setSort} placement="floating" />
        </View>
      ) : null}
    </View>
  );
}

/** Grid or shelf, as two glass icon buttons; the chosen one takes the tint. */
function LayoutToggle({ layout, onChange }: { layout: Layout; onChange: (layout: Layout) => void }) {
  const theme = useTheme();
  const options: { key: Layout; icon: Parameters<typeof Icon>[0]['name']; label: string }[] = [
    { key: 'shelf', icon: 'books.vertical', label: 'Shelf' },
    { key: 'grid', icon: 'square.grid.2x2', label: 'Grid' },
  ];

  return (
    <GlassSurface
      radius={radius.pill}
      style={{ flexDirection: 'row', borderRadius: radius.pill, padding: 4, marginTop: 2 }}
    >
      {options.map((option) => {
        const selected = option.key === layout;
        return (
          <Press
            key={option.key}
            haptic="selection"
            scaleTo={0.92}
            role="radio"
            aria-label={option.label}
            aria-checked={selected}
            onPress={() => onChange(option.key)}
          >
            <View
              style={{
                width: 48,
                height: 40,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? theme.tint : 'transparent',
              }}
            >
              <Icon
                name={option.icon}
                size={19}
                color={selected ? theme.onTint : theme.textSecondary}
              />
            </View>
          </Press>
        );
      })}
    </GlassSurface>
  );
}

/** Diameter of the iOS 26 tab bar's search circle, which the sort button matches. */
const SORT_BUTTON_SIZE = 62;

/**
 * Floating, the button is a round glass circle with its menu stacked above
 * it. In the header it's a pill showing the current order, the same height as
 * the layout toggle beside it, and the menu drops down underneath.
 */
function SortButton({
  sort,
  onChange,
  placement,
}: {
  sort: SortKey;
  onChange: (key: SortKey) => void;
  placement: 'floating' | 'header';
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const inHeader = placement === 'header';
  const current = SORTS.find((s) => s.key === sort)!;

  const menu = open ? (
    <GlassSurface
      radius={radius.lg}
      style={[
        { borderRadius: radius.lg, overflow: 'hidden', minWidth: 190 },
        inHeader
          ? {
              position: 'absolute',
              top: 56,
              right: 0,
              borderWidth: 1,
              borderColor: theme.separator,
              shadowColor: theme.shadow,
              shadowOpacity: theme.scheme === 'dark' ? 0.4 : 0.12,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
            }
          : null,
      ]}
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
  ) : null;

  if (inHeader) {
    return (
      <View style={{ alignItems: 'flex-end', zIndex: 20 }}>
        <Press
          onPress={() => setOpen((v) => !v)}
          haptic="light"
          scaleTo={0.94}
          aria-label={`Sort by ${current.label}`}
          aria-expanded={open}
        >
          <GlassSurface
            interactive
            radius={radius.pill}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              height: 48,
              paddingLeft: 16,
              paddingRight: 18,
              marginTop: 2,
              borderRadius: radius.pill,
            }}
          >
            <Icon
              name={open ? 'xmark' : 'arrow.up.arrow.down'}
              size={16}
              weight="medium"
              color={theme.textSecondary}
            />
            <Text style={[type_.subhead, { fontWeight: '600', color: theme.text }]}>
              {current.label}
            </Text>
          </GlassSurface>
        </Press>
        {menu}
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'flex-end', gap: 8 }}>
      {menu}

      <Press onPress={() => setOpen((v) => !v)} haptic="light" scaleTo={0.9}>
        <GlassSurface
          interactive
          radius={radius.pill}
          style={{
            width: SORT_BUTTON_SIZE,
            height: SORT_BUTTON_SIZE,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: theme.shadow,
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 5 },
          }}
        >
          {/* Sized and weighted like the tab bar's own search glyph beside it. */}
          <Icon name={open ? 'xmark' : 'arrow.up.arrow.down'} size={24} weight="medium" color={theme.text} />
        </GlassSurface>
      </Press>
    </View>
  );
}
