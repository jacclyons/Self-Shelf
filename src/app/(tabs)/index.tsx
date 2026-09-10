import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { imageUrl } from '@/api/client';
import { useContinueReading, useLocalBooks, useProgressSync, useShelf } from '@/api/hooks';
import { authorOf, formatOf, type BaseItem } from '@/api/types';
import { useAuth } from '@/state/auth';
import { getProgress } from '@/state/db';
import { EmptyState, Icon, ProgressRing, SectionHeader } from '@/ui/Bits';
import { BookCover } from '@/ui/BookCover';
import { GlassSurface } from '@/ui/Glass';
import { Press } from '@/ui/Press';
import { Shelf, ShelfSkeleton } from '@/ui/Shelf';
import { contentColumn, radius, tabBarInset, type as type_, useTheme } from '@/ui/theme';

export default function ReadingNow() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const flushProgress = useProgressSync();
  const [refreshing, setRefreshing] = useState(false);

  const continueReading = useContinueReading();
  const recent = useShelf('recent', { sortBy: 'DateCreated', sortOrder: 'Descending', limit: 20 });
  const favorites = useShelf('favorites', { isFavorite: true, limit: 20 });
  const finished = useShelf('finished', { isPlayed: true, sortBy: 'DatePlayed', sortOrder: 'Descending', limit: 20 });
  const local = useLocalBooks();

  const hero = continueReading.data?.[0];
  const restOfContinue = useMemo(() => continueReading.data?.slice(1) ?? [], [continueReading.data]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await flushProgress();
    await Promise.all([
      continueReading.refetch(),
      recent.refetch(),
      favorites.refetch(),
      finished.refetch(),
      local.refetch(),
    ]);
    setRefreshing(false);
  }, [continueReading, favorites, finished, flushProgress, local, recent]);

  if (!session) return null;

  const loading = continueReading.isPending && recent.isPending;
  const empty =
    !loading &&
    !hero &&
    !recent.data?.length &&
    !favorites.data?.length &&
    !finished.data?.length &&
    !local.data?.length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={[
        contentColumn,
        { paddingTop: insets.top + 8 + tabBarInset, paddingBottom: insets.bottom + 120 },
      ]}
      contentInsetAdjustmentBehavior="never"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textTertiary} />
      }
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          marginBottom: 20,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: 'Georgia',
              fontSize: 34,
              lineHeight: 41,
              fontWeight: '600',
              color: theme.text,
              letterSpacing: -0.4,
            }}
          >
            {greeting()}
          </Text>
        </View>
        <Press onPress={() => router.push('/settings')} haptic="selection" scaleTo={0.9}>
          <GlassSurface
            radius={radius.pill}
            interactive
            style={{
              width: 38,
              height: 38,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="person.fill" size={17} color={theme.text} />
          </GlassSurface>
        </Press>
      </View>

      {empty ? (
        <EmptyState
          icon="books.vertical"
          title="Nothing on the shelf yet"
          message="Add books to a Jellyfin library with the Bookshelf plugin, then pull down to refresh."
          action="Open Library"
          onAction={() => router.push('/library')}
        />
      ) : null}

      {hero ? <HeroCard item={hero} /> : loading ? <HeroSkeleton /> : null}

      {restOfContinue.length ? (
        <View style={{ marginTop: 34 }}>
          <SectionHeader title="Keep Reading" />
          <Shelf items={restOfContinue} session={session} />
        </View>
      ) : null}

      <ShelfSection
        title="Recently Added"
        items={recent.data}
        loading={recent.isPending}
        onSeeAll={() => router.push('/library')}
      />
      <ShelfSection
        title="On This iPhone"
        items={local.data}
        loading={local.isPending}
        onSeeAll={local.data?.length ? () => router.push('/library') : undefined}
      />
      <ShelfSection title="Readlist" items={favorites.data} loading={favorites.isPending} />
      <ShelfSection title="Finished" items={finished.data} loading={finished.isPending} />
    </ScrollView>
  );
}

function ShelfSection({
  title,
  items,
  loading,
  onSeeAll,
}: {
  title: string;
  items?: BaseItem[];
  loading?: boolean;
  onSeeAll?: () => void;
}) {
  const { session } = useAuth();
  if (!session) return null;
  if (!loading && !items?.length) return null;

  return (
    <View style={{ marginTop: 34 }}>
      <SectionHeader title={title} action={onSeeAll ? 'See All' : undefined} onAction={onSeeAll} />
      {loading ? <ShelfSkeleton /> : <Shelf items={items!} session={session} />}
    </View>
  );
}

/**
 * The book you're actually in the middle of, blown up: its own cover art
 * blurred behind a sheet of glass, so the card takes on the book's colour.
 */
function HeroCard({ item }: { item: BaseItem }) {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const { width } = useWindowDimensions();

  const progress = getProgress(item.Id);
  const percent = progress?.percent ?? 0;
  const coverWidth = Math.min(140, width * 0.34);
  const backdrop = session ? imageUrl(session, item, { width: 60, quality: 60 }) : undefined;
  const format = formatOf(item);

  if (!session) return null;

  return (
    <Animated.View entering={FadeIn.duration(420)} style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: radius.xl,
          overflow: 'hidden',
          shadowColor: theme.shadow,
          shadowOpacity: theme.scheme === 'dark' ? 0.6 : 0.16,
          shadowRadius: 26,
          shadowOffset: { width: 0, height: 12 },
        }}
      >
        {backdrop ? (
          <Image
            source={{ uri: backdrop }}
            style={{ position: 'absolute', inset: 0 }}
            contentFit="cover"
            blurRadius={38}
            transition={300}
          />
        ) : null}
        <View
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor:
              theme.scheme === 'dark' ? 'rgba(10,9,12,0.62)' : 'rgba(247,243,236,0.58)',
          }}
        />

        <GlassSurface variant="clear" radius={radius.xl} style={{ borderRadius: radius.xl }}>
          <View style={{ flexDirection: 'row', padding: 18, gap: 16, alignItems: 'center' }}>
            <Press
              onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.Id } })}
              scaleTo={0.96}
            >
              <BookCover item={item} session={session} width={coverWidth} elevation="high" radius={7} />
            </Press>

            <View style={{ flex: 1, justifyContent: 'space-between', gap: 12 }}>
              <View>
                <Text
                  numberOfLines={2}
                  style={[type_.title3, { color: theme.text, letterSpacing: -0.3 }]}
                >
                  {item.Name}
                </Text>
                {authorOf(item) ? (
                  <Text
                    numberOfLines={1}
                    style={[type_.subhead, { color: theme.textSecondary, marginTop: 3 }]}
                  >
                    {authorOf(item)}
                  </Text>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ProgressRing percent={percent} size={30} stroke={2.5}>
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text
                      style={[
                        type_.caption2,
                        { color: theme.textSecondary, fontVariant: ['tabular-nums'] },
                      ]}
                    >
                      {Math.round(percent * 100)}
                    </Text>
                  </View>
                </ProgressRing>
                <Text style={[type_.footnote, { color: theme.textSecondary, flex: 1 }]}>
                  {percent > 0 ? `${Math.round((1 - percent) * 100)}% left` : 'Not started'}
                  {format === 'pdf' ? ' · PDF' : ''}
                </Text>
              </View>

              <Press
                onPress={() => router.push({ pathname: '/reader/[id]', params: { id: item.Id } })}
                haptic="medium"
              >
                <GlassSurface
                  variant="regular"
                  interactive
                  tintColor={theme.tint}
                  radius={radius.pill}
                  style={{
                    height: 44,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 7,
                    backgroundColor: theme.tint,
                  }}
                >
                  <Icon name="book.fill" size={14} color="#fff" />
                  <Text style={[type_.subhead, { color: '#fff', fontWeight: '600' }]}>
                    {percent > 0 ? 'Continue' : 'Start Reading'}
                  </Text>
                </GlassSurface>
              </Press>
            </View>
          </View>
        </GlassSurface>
      </View>
    </Animated.View>
  );
}

function HeroSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          height: 218,
          borderRadius: radius.xl,
          backgroundColor: theme.surfaceAlt,
        }}
      />
    </View>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
