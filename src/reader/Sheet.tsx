import { useEffect, useState, type ReactNode } from 'react';
import {
  Keyboard,
  type KeyboardEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/ui/Bits';
import { GlassSurface } from '@/ui/Glass';
import { Press } from '@/ui/Press';
import { radius, serif, useTheme } from '@/ui/theme';

/** The curve iOS uses for sheet presentation — quick to move, slow to settle. */
const SHEET_IN = Easing.bezier(0.32, 0.72, 0, 1);
const SHEET_OUT = Easing.bezier(0.4, 0, 0.9, 0.4);
const IN_MS = 340;
const OUT_MS = 240;

interface SheetProps {
  visible: boolean;
  onClose(): void;
  title: string;
  children: ReactNode;
  /** Fraction of the screen the sheet is allowed to occupy. */
  maxHeight?: string;
  /**
   * Always fill `maxHeight`, however little is inside. A sheet whose tabs
   * hold lists of very different lengths would otherwise grow and shrink
   * on every switch.
   */
  fixedHeight?: boolean;
  scroll?: boolean;
  /** Reader sheets follow the page theme, not the system appearance. */
  dark?: boolean;
  /** Title colour; reader sheets pass the page theme's own text colour. */
  fg?: string;
}

/**
 * A sheet is a phone-shaped thing. In a wide browser window it stays that
 * shape, centred, rather than stretching across the whole screen; anything
 * laying out a grid inside one should measure against this, not the window.
 */
const MAX_SHEET_WIDTH = 600;

export function useSheetWidth(): number {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' ? Math.min(width - 20, MAX_SHEET_WIDTH) : width - 20;
}

/** A glass bottom sheet that floats above the page, Apple Books style. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  maxHeight = '76%',
  fixedHeight = false,
  scroll = true,
  dark,
  fg,
}: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const sheetWidth = useSheetWidth();
  const isDark = dark ?? theme.scheme === 'dark';
  // Every colour follows `isDark`, never the app palette: a reader sheet over
  // a light page while the app is in dark mode used to get near-white text.
  const titleColor = fg ?? (isDark ? '#F2EFEA' : '#181513');
  const closeBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,22,16,0.07)';
  const closeFg = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(24,21,19,0.55)';

  // The Modal has to outlive `visible` until the sheet is off screen. Hiding
  // it tears down everything inside in the same frame, so exit animations on
  // the children never ran and the sheet just vanished. The animation itself
  // is a shared value rather than entering/exiting, so closing always plays
  // and only unmounts once it has finished.
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: IN_MS, easing: SHEET_IN });
    } else {
      progress.value = withTiming(0, { duration: OUT_MS, easing: SHEET_OUT }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [visible, progress]);

  // The keyboard would otherwise cover the bottom of the sheet, and with it
  // whatever field summoned it (the search box in Contents). Track its height
  // and lift the panel to sit just above it, shrinking it if there's no room
  // left. iOS gives `will` events with the keyboard's own animation timing, so
  // the panel moves in step with it; Android only reports after the fact.
  const keyboard = useSharedValue(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const ios = Platform.OS === 'ios';
    const to = (height: number, e: KeyboardEvent) => {
      keyboard.value = withTiming(height, { duration: ios ? e.duration || 250 : 160, easing: SHEET_IN });
    };
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      to(e.endCoordinates.height, e),
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => to(0, e));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [keyboard]);

  const restingBottom = Math.max(insets.bottom, 10);
  const fraction = parseFloat(maxHeight) / 100;
  const frameStyle = useAnimatedStyle(() => {
    // The keyboard's height already covers the home indicator, so the panel
    // only needs its usual 10pt breathing room above it.
    const bottom = keyboard.value > 0 ? keyboard.value + 10 : restingBottom;
    const limit = Math.min(windowHeight * fraction, windowHeight - bottom - insets.top - 10);
    return fixedHeight ? { bottom, height: limit } : { bottom, maxHeight: limit };
  });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  // A spring overshoots and reads as a pop; this is the curve iOS uses for its
  // own sheets, so the panel just rises and settles, then falls away.
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * windowHeight }],
  }));

  const Body = scroll ? ScrollView : View;

  return (
    <Modal visible={visible || mounted} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[{ flex: 1 }, backdropStyle]}>
        <Pressable
          style={{ flex: 1, backgroundColor: theme.overlay }}
          onPress={onClose}
          disabled={!visible}
        />
      </Animated.View>

      {/* The slide lives on a full-screen layer so it can't interfere with the
          panel's own layout transition below. */}
      <Animated.View
        pointerEvents={visible ? 'box-none' : 'none'}
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, panelStyle]}
      >
        <Animated.View
          // Content that grows or shrinks (a tab switch, Customize opening)
          // pushes the top edge up or down; this eases it instead of snapping.
          layout={LinearTransition.duration(260).easing(SHEET_IN)}
          style={[
            { position: 'absolute', left: (windowWidth - sheetWidth) / 2, width: sheetWidth },
            frameStyle,
          ]}
        >
          <GlassSurface
            radius={radius.xl}
            colorScheme={isDark ? 'dark' : 'light'}
            style={{
              borderRadius: radius.xl,
              overflow: 'hidden',
              backgroundColor: isDark ? 'rgba(28,26,32,0.88)' : 'rgba(252,250,246,0.9)',
              // Views don't shrink by default, so without this a tall sheet
              // would overflow the frame's maxHeight and be clipped at the
              // bottom instead of scrolling.
              flex: fixedHeight ? 1 : undefined,
              flexShrink: 1,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingTop: 18,
                paddingBottom: 12,
              }}
            >
              {/* Ovo has no bold cut; the faked weight is the same trick as
                  the section titles in `ui/Bits.tsx`. */}
              <Text
                style={[
                  { fontFamily: serif, fontSize: 22, lineHeight: 27, color: titleColor, letterSpacing: -0.2 },
                  Platform.OS === 'web'
                    ? null
                    : { textShadowColor: titleColor, textShadowOffset: { width: 0.5, height: 0 }, textShadowRadius: 0 },
                ]}
              >
                {title}
              </Text>
              <Press onPress={onClose} haptic="selection" scaleTo={0.9} hitSlop={10}>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: closeBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="xmark" size={12} color={closeFg} weight="bold" />
                </View>
              </Press>
            </View>

            <Body
              style={fixedHeight ? { flex: 1 } : { flexGrow: 0, flexShrink: 1 }}
              contentContainerStyle={scroll ? { paddingBottom: 28 } : undefined}
              showsVerticalScrollIndicator={false}
              // A tap on a chapter with the keyboard up should open it, not
              // just dismiss the keyboard.
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {children}
            </Body>
          </GlassSurface>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
