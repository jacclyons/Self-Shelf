import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SymbolViewProps } from 'expo-symbols';

import { useDismissTo } from '@/lib/navigation';
import { markOnboardingSeen } from '@/lib/onboarding';
import { useAuth } from '@/state/auth';
import { Icon } from '@/ui/Bits';
import { Press } from '@/ui/Press';
import { radius, readingColumn, shelf, type as type_, useTheme } from '@/ui/theme';

interface Page {
  /** The opening page shows the real app mark; the rest use symbols on the brand gradient. */
  mark?: boolean;
  icon: SymbolViewProps['name'];
  title: string;
  body: string;
}

/**
 * The last page is doing real work beyond marketing: JellyShelf is useless without
 * somebody else's Jellyfin server, and a cold launch straight into a server-URL
 * field reads as a broken app to anyone who doesn't already run one.
 */
const PAGES: Page[] = [
  {
    mark: true,
    icon: 'books.vertical.fill',
    title: 'Your shelf, in your pocket',
    body: 'Open the books, comics and PDFs already sitting in your Jellyfin library or iPhone Files.',
  },
  {
    icon: 'textformat.size',
    title: 'Built for reading',
    body: 'EPUB, PDF and comic archives with your own type size, margins and theme. Your place is kept offline and synced back to Jellyfin.',
  },
  {
    icon: 'server.rack',
    title: 'Bring your own server',
    body: 'Sign into Jellyfin (equipped with the Bookshelf plugin). You can also drop your own EPUBs straight into the app from Files.',
  },
];

export default function Welcome() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  // Replaying from Settings: there is already a session, so the walkthrough is
  // just a screen to dismiss rather than the doorway into signing in.
  const { session } = useAuth();
  const replay = session !== null;

  const dismiss = useDismissTo('/');

  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const last = index === PAGES.length - 1;

  const finish = useCallback(() => {
    if (replay) {
      dismiss();
      return;
    }
    // Recorded before navigating so the gate in `_layout` sees it on the very next
    // segment change and does not bounce us straight back here.
    markOnboardingSeen();
    router.replace('/sign-in');
  }, [replay, router, dismiss]);

  const advance = useCallback(() => {
    if (last) return finish();
    scroller.current?.scrollTo({ x: (index + 1) * width, animated: true });
  }, [last, finish, index, width]);

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
    },
    [width],
  );

  return (
    <Animated.View entering={FadeIn.duration(320)} style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ height: insets.top }} />

      <View style={{ alignItems: 'flex-end', paddingHorizontal: 20, height: 44 }}>
        {!last && (
          <Press onPress={finish} hitSlop={12} haptic="selection">
            <Text style={[type_.callout, { color: theme.textSecondary }]}>
              {replay ? 'Close' : 'Skip'}
            </Text>
          </Press>
        )}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // `onMomentumScrollEnd` never fires on web, which would leave `index`
        // stuck at 0 and every Continue scrolling to the same page. Tracking
        // the offset as it moves works on both platforms.
        onScroll={onScrollEnd}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onScrollEnd}
        style={{ flex: 1 }}
      >
        {PAGES.map((page) => (
          <View
            key={page.title}
            style={{ width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
          >
            <View style={[readingColumn, { alignItems: 'center' }]}>
            {page.mark ? (
              <Image
                source={require('../../assets/images/splash-icon.png')}
                contentFit="contain"
                style={{ width: 132, height: 132, marginBottom: 36 }}
              />
            ) : (
              <LinearGradient
                colors={[shelf.green, shelf.teal]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 108,
                  height: 108,
                  borderRadius: radius.xl,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 36,
                }}
              >
                <Icon name={page.icon} size={52} color="#FFFFFF" weight="semibold" />
              </LinearGradient>
            )}

            <Text
              style={[type_.title1, { color: theme.text, textAlign: 'center', marginBottom: 14 }]}
            >
              {page.title}
            </Text>
            <Text style={[type_.body, { color: theme.textSecondary, textAlign: 'center' }]}>
              {page.body}
            </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 28 }}>
        {PAGES.map((page, i) => (
          <View
            key={page.title}
            style={{
              width: i === index ? 22 : 7,
              height: 7,
              borderRadius: radius.pill,
              backgroundColor: i === index ? shelf.teal : theme.hairline,
            }}
          />
        ))}
      </View>

      <View
        style={[
          readingColumn,
          { paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 20) + 8 },
        ]}
      >
        <Press onPress={advance} haptic="medium">
          <LinearGradient
            colors={[shelf.green, shelf.teal]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              height: 54,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={[type_.headline, { color: '#FFFFFF' }]}>
              {last ? (replay ? 'Done' : 'Connect to Jellyfin') : 'Continue'}
            </Text>
          </LinearGradient>
        </Press>
      </View>
    </Animated.View>
  );
}
