import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { imageUrl } from '@/api/client';
import { useBook, useToggleFavorite, useToggleFinished } from '@/api/hooks';
import { authorOf, formatOf, isReadable } from '@/api/types';
import { showAlert } from '@/lib/alert';
import { useDismissTo } from '@/lib/navigation';
import {
  canDownload,
  deleteDownload,
  downloadBook,
  formatBytes,
  isDownloaded,
  type DownloadHandle,
} from '@/lib/storage';
import { isLocalId } from '@/lib/localBooks';
import { useAuth } from '@/state/auth';
import { clearProgress, getDownload, getProgress } from '@/state/db';
import { EmptyState, Icon, ProgressBar } from '@/ui/Bits';
import { BookCover } from '@/ui/BookCover';
import { GlassSurface } from '@/ui/Glass';
import { CloseButton } from '@/ui/CloseButton';
import { Press } from '@/ui/Press';
import { contentColumn, radius, type as type_, useTheme } from '@/ui/theme';

const BACKDROP_HEIGHT = 440;

/** Hex from the palette to rgba, so a gradient can fade it to nothing. */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function BookDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const dismiss = useDismissTo('/');
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { width } = useWindowDimensions();

  const book = useBook(id);
  const favorite = useToggleFavorite();
  const finished = useToggleFinished();

  const [downloading, setDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [handle, setHandle] = useState<DownloadHandle | null>(null);
  const [, forceUpdate] = useState(0);

  const refresh = useCallback(() => forceUpdate((n) => n + 1), []);

  useEffect(() => () => handle?.cancel(), [handle]);

  const item = book.data;
  const format = item ? formatOf(item) : 'unsupported';
  const progress = item ? getProgress(item.Id) : null;
  const percent = progress?.percent ?? 0;
  const local = item ? isLocalId(item.Id) : false;
  const downloaded = item ? local || isDownloaded(item.Id) : false;
  const downloadRow = item ? getDownload(item.Id) : null;
  const supported = isReadable(format);

  const startDownload = useCallback(async () => {
    if (!session || !item) return;
    setDownloading(true);
    setDownloadPercent(0);
    const task = downloadBook(session, item, (fraction) => setDownloadPercent(fraction));
    setHandle(task);
    try {
      await task.promise;
      refresh();
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        showAlert('Download failed', (error as Error).message ?? 'Please try again.');
      }
    } finally {
      setDownloading(false);
      setHandle(null);
    }
  }, [item, refresh, session]);

  if (!session && !(id && isLocalId(id))) return null;

  if (book.isPending) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.textTertiary} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center' }}>
        <EmptyState
          icon="exclamationmark.triangle"
          title="Book unavailable"
          message={(book.error as Error)?.message}
          action="Close"
          onAction={dismiss}
        />
      </View>
    );
  }

  const coverWidth = Math.min(190, width * 0.46);
  // Local books carry no server art; imageUrl returns undefined without a tag.
  const coverSession = session ?? { serverUrl: '' };
  const backdrop = imageUrl(coverSession, item, { width: 60, quality: 60 });
  const isFavorite = !!item.UserData?.IsFavorite;
  const isFinished = !!item.UserData?.Played || progress?.finished === 1;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <CloseButton onPress={dismiss} />
      {backdrop ? (
        <>
          <Image
            source={{ uri: backdrop }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: BACKDROP_HEIGHT }}
            contentFit="cover"
            blurRadius={60}
            transition={400}
          />
          {/* Fade the blur into the page: a flat overlay just ends in a hard
              edge, which reads as a grey block rather than an effect. */}
          <LinearGradient
            colors={[
              withAlpha(theme.bg, 0.55),
              withAlpha(theme.bg, 0.82),
              withAlpha(theme.bg, 1),
            ]}
            locations={[0, 0.55, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: BACKDROP_HEIGHT }}
          />
        </>
      ) : null}

      <ScrollView
        contentContainerStyle={[contentColumn, { paddingTop: 26, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', paddingHorizontal: 24 }}>
          <BookCover item={item} session={coverSession} width={coverWidth} elevation="high" radius={8} />

          <Text
            style={[
              type_.title2,
              { color: theme.text, textAlign: 'center', marginTop: 22, letterSpacing: -0.4 },
            ]}
          >
            {item.Name}
          </Text>
          {authorOf(item) ? (
            <Text style={[type_.callout, { color: theme.textSecondary, marginTop: 5 }]}>
              {authorOf(item)}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' }}>
            {item.ProductionYear ? <Meta text={String(item.ProductionYear)} /> : null}
            <Meta text={format.startsWith('comic') ? 'Comic' : format.toUpperCase()} />
            {downloadRow?.size ? <Meta text={formatBytes(downloadRow.size)} /> : null}
          </View>

          {percent > 0.001 && percent < 0.999 ? (
            <View style={{ width: '78%', marginTop: 20, gap: 7 }}>
              <ProgressBar percent={percent} height={4} />
              <Text style={[type_.caption, { color: theme.textTertiary, textAlign: 'center' }]}>
                {Math.round(percent * 100)}% · {Math.round((1 - percent) * 100)}% left
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 24, marginTop: 26 }}>
          {supported ? (
            <Press
              haptic="medium"
              onPress={() => router.push({ pathname: '/reader/[id]', params: { id: item.Id } })}
            >
              <View
                style={{
                  height: 52,
                  borderRadius: radius.pill,
                  backgroundColor: theme.tint,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                }}
              >
                <Icon name="book.fill" size={16} color="#fff" />
                <Text style={[type_.headline, { color: '#fff' }]}>
                  {percent > 0.001 ? 'Continue Reading' : 'Read'}
                </Text>
              </View>
            </Press>
          ) : (
            <View
              style={{
                padding: 16,
                borderRadius: radius.md,
                backgroundColor: theme.surfaceAlt,
                flexDirection: 'row',
                gap: 11,
              }}
            >
              <Icon name="info.circle" size={16} color={theme.textSecondary} />
              <Text style={[type_.footnote, { color: theme.textSecondary, flex: 1 }]}>
                Self-Shelf reads EPUB, PDF, CBZ and CBR. This one is{' '}
                {format === 'comic-unsupported'
                  ? 'a 7z or tar-based comic archive, which needs another decoder'
                  : 'an unsupported format'}{' '}
                — you can still download it and open it elsewhere.
              </Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 24, marginTop: 12 }}>
          {canDownload ? (
          <ActionTile
            icon={
              local
                ? 'iphone'
                : downloading
                  ? 'stop.circle'
                  : downloaded
                    ? 'checkmark.circle.fill'
                    : 'arrow.down.circle'
            }
            label={
              local
                ? 'On This iPhone'
                : downloading
                  ? `${Math.round(downloadPercent * 100)}%`
                  : downloaded
                    ? 'Downloaded'
                    : 'Download'
            }
            active={downloaded}
            onPress={() => {
              // A file you put in the Files folder is yours to remove there.
              if (local) {
                showAlert(
                  'Stored on this iPhone',
                  'This book lives in the Self-Shelf folder in the Files app. Delete it there to remove it.',
                );
                return;
              }
              if (downloading) {
                handle?.cancel();
              } else if (downloaded) {
                showAlert('Remove download?', 'The book stays on your server.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => {
                      deleteDownload(item.Id);
                      refresh();
                    },
                  },
                ]);
              } else {
                startDownload();
              }
            }}
          />
          ) : null}
          <ActionTile
            icon={isFavorite ? 'heart.fill' : 'heart'}
            label="Readlist"
            active={isFavorite}
            onPress={() => favorite.mutate({ item, favorite: !isFavorite })}
          />
          <ActionTile
            icon={isFinished ? 'checkmark.seal.fill' : 'checkmark.seal'}
            label="Finished"
            active={isFinished}
            onPress={() => {
              if (isFinished) clearProgress(item.Id);
              finished.mutate({ item, finished: !isFinished });
              refresh();
            }}
          />
        </View>

        {downloading ? (
          <View style={{ paddingHorizontal: 24, marginTop: 14 }}>
            <ProgressBar percent={downloadPercent} height={3} />
          </View>
        ) : null}

        {item.Overview ? (
          <View style={{ paddingHorizontal: 24, marginTop: 34 }}>
            <Text style={[type_.title3, { color: theme.text, marginBottom: 10 }]}>About</Text>
            <Text style={[type_.body, { color: theme.textSecondary, lineHeight: 25 }]}>
              {item.Overview.replace(/<[^>]+>/g, '').trim()}
            </Text>
          </View>
        ) : null}

        {item.Genres?.length ? (
          <View style={{ paddingHorizontal: 24, marginTop: 28 }}>
            <Text style={[type_.title3, { color: theme.text, marginBottom: 12 }]}>Genres</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {item.Genres.map((genre) => (
                <View
                  key={genre}
                  style={{
                    paddingHorizontal: 13,
                    paddingVertical: 7,
                    borderRadius: radius.pill,
                    backgroundColor: theme.surfaceAlt,
                  }}
                >
                  <Text style={[type_.footnote, { color: theme.textSecondary }]}>{genre}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Meta({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Text style={[type_.footnote, { color: theme.textTertiary, fontWeight: '500' }]}>{text}</Text>
  );
}

function ActionTile({
  icon,
  label,
  active,
  onPress,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Press onPress={onPress} haptic="light" style={{ flex: 1 }} scaleTo={0.95}>
      <GlassSurface
        radius={radius.md}
        style={{
          borderRadius: radius.md,
          paddingVertical: 14,
          alignItems: 'center',
          gap: 6,
          backgroundColor: active ? theme.tintSoft : theme.surfaceAlt,
        }}
      >
        <Icon name={icon} size={19} color={active ? theme.tint : theme.textSecondary} />
        <Text
          numberOfLines={1}
          style={[
            type_.caption,
            { color: active ? theme.tint : theme.textSecondary, fontWeight: '600' },
          ]}
        >
          {label}
        </Text>
      </GlassSurface>
    </Press>
  );
}
