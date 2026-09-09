import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import type { Session } from '@/api/client';
import { useToggleFavorite, useToggleFinished } from '@/api/hooks';
import { authorOf, type BaseItem } from '@/api/types';
import { isLocalId } from '@/lib/localBooks';
import { deleteDownload, downloadBook, isDownloaded } from '@/lib/storage';
import { useAuth } from '@/state/auth';
import { clearProgress, getProgress } from '@/state/db';

import { BookCover } from './BookCover';
import { ProgressBar, ProgressRing } from './Bits';
import { BookQuickActions, type Anchor, type QuickAction } from './BookQuickActions';
import { MetadataSheet } from './MetadataSheet';
import { Press } from './Press';
import { type as type_, useTheme } from './theme';

interface BookTileProps {
  item: BaseItem;
  session: Session;
  width: number;
  showProgress?: boolean;
  onPress?: () => void;
}

export function BookTile({ item, session, width, showProgress = true, onPress }: BookTileProps) {
  const theme = useTheme();
  const router = useRouter();
  const favorite = useToggleFavorite();
  const finished = useToggleFinished();
  const queryClient = useQueryClient();

  const coverRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [, bump] = useState(0);
  const refresh = useCallback(() => bump((n) => n + 1), []);

  const progress = getProgress(item.Id);
  const percent = progress?.percent ?? 0;
  const author = authorOf(item);
  const local = isLocalId(item.Id);
  const downloaded = local || isDownloaded(item.Id);
  const isFavorite = !!item.UserData?.IsFavorite;
  const isFinished = !!item.UserData?.Played || progress?.finished === 1;

  const openMenu = useCallback(() => {
    coverRef.current?.measureInWindow((x, y, w, h) => {
      if (!w || !h) return;
      setAnchor({ x, y, width: w, height: h });
      setMenuOpen(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    });
  }, []);

  const startDownload = useCallback(() => {
    setDownloadPct(0);
    const task = downloadBook(session, item, (fraction) => setDownloadPct(fraction));
    task.promise
      .then(refresh)
      .catch(() => {})
      .finally(() => setDownloadPct(null));
  }, [item, refresh, session]);

  const actions: QuickAction[] = [
    // A book that already lives on the device has nothing to download; what it
    // usually wants instead is a real title and cover.
    local
      ? {
          key: 'metadata',
          label: 'Find Metadata…',
          icon: 'sparkle.magnifyingglass',
          onPress: () => setMetadataOpen(true),
        }
      : downloaded
        ? {
            key: 'download',
            label: 'Remove Download',
            icon: 'trash',
            destructive: true,
            onPress: () => {
              deleteDownload(item.Id);
              refresh();
            },
          }
        : {
            key: 'download',
            label: 'Download',
            icon: 'arrow.down.circle',
            disabled: downloadPct !== null,
            onPress: startDownload,
          },
    {
      key: 'favorite',
      label: isFavorite ? 'Remove from Readlist' : 'Add to Readlist',
      icon: isFavorite ? 'heart.fill' : 'heart',
      active: isFavorite,
      onPress: () => favorite.mutate({ item, favorite: !isFavorite }),
    },
    {
      key: 'finished',
      label: isFinished ? 'Mark as Unfinished' : 'Finish',
      icon: isFinished ? 'checkmark.seal.fill' : 'checkmark.seal',
      active: isFinished,
      onPress: () => {
        if (isFinished) clearProgress(item.Id);
        finished.mutate({ item, finished: !isFinished });
        refresh();
      },
    },
  ];

  return (
    <>
      <Press
        onPress={onPress ?? (() => router.push({ pathname: '/book/[id]', params: { id: item.Id } }))}
        onLongPress={openMenu}
        style={{ width }}
        scaleTo={0.94}
      >
        <View ref={coverRef} collapsable={false}>
          <BookCover item={item} session={session} width={width} elevation="low" />

          {downloadPct !== null ? (
            <View
              style={{
                position: 'absolute',
                inset: 0,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.4)',
                borderRadius: 6,
              }}
            >
              <ProgressRing percent={downloadPct} size={34} stroke={3} color="#fff" track="rgba(255,255,255,0.3)" />
            </View>
          ) : downloaded && !local ? (
            <View
              style={{
                position: 'absolute',
                right: 5,
                bottom: 5,
                width: 17,
                height: 17,
                borderRadius: 9,
                backgroundColor: 'rgba(0,0,0,0.55)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
            </View>
          ) : null}
        </View>

        <Text
          numberOfLines={2}
          style={[type_.footnote, { color: theme.text, fontWeight: '600', marginTop: 9 }]}
        >
          {item.Name}
        </Text>
        {author ? (
          <Text numberOfLines={1} style={[type_.caption, { color: theme.textTertiary, marginTop: 1 }]}>
            {author}
          </Text>
        ) : null}
        {showProgress && percent > 0.001 && percent < 0.999 ? (
          <ProgressBar percent={percent} style={{ marginTop: 7, width: width * 0.72 }} />
        ) : null}
      </Press>

      <BookQuickActions
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        item={item}
        session={session}
        anchor={anchor}
        actions={actions}
      />

      {local ? (
        <MetadataSheet
          visible={metadataOpen}
          onClose={() => setMetadataOpen(false)}
          item={item}
          onApplied={() => {
            // The title and cover live in the query cache, not local state.
            queryClient.invalidateQueries({ queryKey: ['local-books'] });
            queryClient.invalidateQueries({ queryKey: ['book'] });
            refresh();
          }}
        />
      ) : null}
    </>
  );
}

interface ShelfProps {
  items: BaseItem[];
  session: Session;
  tileWidth?: number;
  showProgress?: boolean;
}

/** A horizontally scrolling row of covers, snapping tile by tile. */
export function Shelf({ items, session, tileWidth = 116, showProgress = true }: ShelfProps) {
  const gap = 16;
  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(item) => item.Id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap }}
      snapToInterval={tileWidth + gap}
      decelerationRate="fast"
      snapToAlignment="start"
      renderItem={({ item }) => (
        <BookTile item={item} session={session} width={tileWidth} showProgress={showProgress} />
      )}
    />
  );
}

export function ShelfSkeleton({ tileWidth = 116, count = 4 }: { tileWidth?: number; count?: number }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 20 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i}>
          <View
            style={{
              width: tileWidth,
              height: tileWidth * 1.5,
              borderRadius: 6,
              backgroundColor: theme.surfaceAlt,
            }}
          />
          <View
            style={{
              width: tileWidth * 0.85,
              height: 11,
              borderRadius: 4,
              backgroundColor: theme.surfaceAlt,
              marginTop: 10,
            }}
          />
        </View>
      ))}
    </View>
  );
}
