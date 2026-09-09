import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { imageUrl, type Session } from '@/api/client';
import type { BaseItem } from '@/api/types';

import { radius as radii, shelf, useTheme } from './theme';

export const COVER_RATIO = 2 / 3;

function blurhashFor(item: BaseItem): string | undefined {
  const tag = item.ImageTags?.Primary;
  if (!tag) return undefined;
  return item.ImageBlurHashes?.Primary?.[tag];
}

function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .replace(/^(the|a|an)\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

interface BookCoverProps {
  item: BaseItem;
  session: Pick<Session, 'serverUrl'>;
  width: number;
  style?: StyleProp<ViewStyle>;
  /** Books sit on a surface; the shadow sells the physicality. */
  elevation?: 'none' | 'low' | 'high';
  radius?: number;
}

export function BookCover({
  item,
  session,
  width,
  style,
  elevation = 'low',
  radius = 6,
}: BookCoverProps) {
  const theme = useTheme();
  const height = width / COVER_RATIO;
  // A sideloaded book may have art fetched from Open Library instead.
  const uri = item.LocalCoverUri ?? imageUrl(session, item, { width: Math.round(width * 3) });
  const blurhash = blurhashFor(item);

  const shadow =
    elevation === 'none'
      ? null
      : {
          shadowColor: theme.shadow,
          shadowOpacity: theme.scheme === 'dark' ? 0.5 : elevation === 'high' ? 0.26 : 0.16,
          shadowRadius: elevation === 'high' ? 22 : 10,
          shadowOffset: { width: 0, height: elevation === 'high' ? 12 : 5 },
        };

  return (
    <View style={[{ width, height, borderRadius: radius }, shadow, style]}>
      <View
        style={{
          width,
          height,
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: theme.surfaceAlt,
        }}
      >
        {uri ? (
          <Image
            source={{ uri }}
            placeholder={blurhash ? { blurhash } : undefined}
            placeholderContentFit="cover"
            contentFit="cover"
            transition={220}
            recyclingKey={item.Id}
            cachePolicy="disk"
            style={StyleSheet.absoluteFill}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <PlaceholderCover item={item} width={width} />
        )}

        {/* Paper sheen + spine shading so flat art still reads as a book. */}
        <LinearGradient
          colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.10)']}
          locations={[0, 0.06, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radius,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.scheme === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)',
            },
          ]}
        />
      </View>
    </View>
  );
}

function PlaceholderCover({ item, width }: { item: BaseItem; width: number }) {
  const author = item.People?.find((p) => p.Type === 'Author')?.Name ?? item.Studios?.[0]?.Name;
  const compact = width < 120;

  return (
    <LinearGradient
      colors={[shelf.green, shelf.teal]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[StyleSheet.absoluteFill, { padding: compact ? 8 : 14, justifyContent: 'space-between' }]}
    >
      {compact ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 22, fontWeight: '700' }}>
            {initials(item.Name)}
          </Text>
        </View>
      ) : (
        <>
          <Text
            numberOfLines={4}
            style={{
              color: '#FFFFFF',
              fontSize: Math.max(13, Math.min(19, width / 8)),
              lineHeight: Math.max(17, Math.min(24, width / 6.4)),
              fontWeight: '700',
            }}
          >
            {item.Name}
          </Text>
          {author ? (
            <Text
              numberOfLines={2}
              style={{ color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '500' }}
            >
              {author}
            </Text>
          ) : null}
        </>
      )}
    </LinearGradient>
  );
}

export { radii };
