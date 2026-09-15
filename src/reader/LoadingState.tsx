import { useEffect } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatBytes } from '@/lib/storage';
import type { ReaderTheme } from '@/state/reader';
import { textOn } from '@/ui/accents';
import { Icon } from '@/ui/Bits';
import { Press } from '@/ui/Press';
import { radius, type as type_ } from '@/ui/theme';

import type { ReaderLoadingProgress } from './protocol';

/** Host stages surround the engine's progress without inventing an overall percentage. */
export type OpeningProgress = ReaderLoadingProgress | {
  stage: 'metadata' | 'preparing' | 'download' | 'opening';
  fraction?: number;
  bytes?: number;
};

const STAGE_LABELS: Record<OpeningProgress['stage'], string> = {
  metadata: 'Finding book…',
  preparing: 'Preparing reader…',
  download: 'Downloading book…',
  opening: 'Opening book…',
  reading: 'Reading file…',
  unpacking: 'Unpacking images…',
  rendering: 'Preparing visible page…',
};

/** One interruptible, themed surface stays up until the first page is actually visible. */
export function LoadingState({
  title,
  progress,
  error,
  comic,
  theme,
  insets,
  onRetry,
  onClose,
}: {
  title: string;
  progress: OpeningProgress;
  error: string | null;
  comic: boolean;
  theme: ReaderTheme;
  insets: { top: number; bottom: number; left: number; right: number };
  onRetry(): void;
  onClose(): void;
}) {
  const status = error ? 'Couldn’t open this book' : STAGE_LABELS[progress.stage];
  const fraction = typeof progress.fraction === 'number' && Number.isFinite(progress.fraction)
    && progress.fraction >= 0 && progress.fraction <= 1 ? progress.fraction : null;
  const percent = fraction === null ? null : Math.round(fraction * 100);
  const bytes = typeof progress.bytes === 'number' && Number.isFinite(progress.bytes)
    && progress.bytes >= 0 ? progress.bytes : null;
  const images = progress.stage === 'unpacking'
    && typeof progress.completed === 'number' && Number.isFinite(progress.completed) && progress.completed >= 0
    && typeof progress.total === 'number' && Number.isFinite(progress.total) && progress.total > 0
    ? `${progress.completed} of ${progress.total} images` : null;
  const detail = images ?? ((progress.stage === 'reading' || progress.stage === 'download') && bytes !== null
    ? `${formatBytes(bytes)} ${progress.stage === 'download' ? 'downloaded' : 'read'}` : null);
  const announcement = error ? `${status}. ${error}` : status;

  // VoiceOver needs an explicit announcement; Android and web use the live label.
  // Only stage changes and failures are announced, never every progress tick.
  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement]);

  return (
    <View
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: theme.bg,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <View style={styles.closeRow}>
        <Press role="button" aria-label="Close reader" onPress={onClose}>
          <View style={[styles.button, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)' }]}>
            <Icon name="xmark" size={14} color={theme.fg} />
            <Text style={[type_.subhead, { color: theme.fg, fontWeight: '600' }]}>Close</Text>
          </View>
        </Press>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <Text accessibilityRole="header" style={[type_.title2, styles.centered, { color: theme.fg }]}>
            {title}
          </Text>
          {error ? (
            <Icon name="exclamationmark.triangle" size={32} color={theme.fg} />
          ) : (
            <ActivityIndicator color={theme.accent} accessible={false} />
          )}
          <Text accessibilityLiveRegion="polite" style={[type_.headline, styles.centered, { color: theme.fg }]}>
            {status}
          </Text>
          {error ? (
            <>
              <Text style={[type_.subhead, styles.centered, { color: theme.fg }]}>{error}</Text>
              <Press role="button" onPress={onRetry}>
                <View style={[styles.button, { backgroundColor: theme.accent }]}>
                  <Text style={[type_.headline, { color: textOn(theme.accent) }]}>Retry</Text>
                </View>
              </Press>
            </>
          ) : (
            <>
              {percent !== null ? (
                <View
                  accessible
                  accessibilityRole="progressbar"
                  accessibilityLabel={status.replace('…', '')}
                  accessibilityValue={{ min: 0, max: 100, now: percent }}
                  accessibilityLiveRegion="none"
                  style={styles.progress}
                >
                  <Text style={[type_.subhead, styles.centered, styles.numeric, { color: theme.fg }]}>{percent}%</Text>
                  <View style={[styles.track, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }]}>
                    <View style={{ height: '100%', width: `${fraction! * 100}%`, backgroundColor: theme.accent }} />
                  </View>
                </View>
              ) : null}
              {detail ? (
                <Text accessibilityLiveRegion="none" style={[type_.footnote, styles.numeric, { color: theme.fg }]}>{detail}</Text>
              ) : null}
              {comic ? (
                <Text style={[type_.footnote, styles.centered, { color: theme.fg, opacity: 0.7 }]}>
                  {progress.stage === 'download'
                    ? 'Comics can be large. You can close the reader to stop this download and try again later.'
                    : progress.stage === 'unpacking'
                      ? 'Getting the images ready. Some comics need to unpack earlier pages before reaching your place.'
                      : 'Your page will appear as soon as it’s ready. You can close the reader at any time.'}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  closeRow: { alignItems: 'flex-end', paddingHorizontal: 20, paddingBottom: 8 },
  button: { minHeight: 44, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 24 },
  content: { width: '100%', maxWidth: 420, alignSelf: 'center', alignItems: 'center', gap: 18 },
  centered: { textAlign: 'center' },
  numeric: { fontVariant: ['tabular-nums'] },
  progress: { width: '100%', gap: 10 },
  track: { height: 4, borderRadius: 4, overflow: 'hidden' },
});
