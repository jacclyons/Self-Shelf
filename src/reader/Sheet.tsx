import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/ui/Bits';
import { GlassSurface } from '@/ui/Glass';
import { Press } from '@/ui/Press';
import { radius, type as type_, useTheme } from '@/ui/theme';

/** The curve iOS uses for sheet presentation — quick to move, slow to settle. */
const SHEET_IN = Easing.bezier(0.32, 0.72, 0, 1);
const SHEET_OUT = Easing.bezier(0.4, 0, 0.9, 0.4);

interface SheetProps {
  visible: boolean;
  onClose(): void;
  title: string;
  children: ReactNode;
  /** Fraction of the screen the sheet is allowed to occupy. */
  maxHeight?: string;
  scroll?: boolean;
  /** Reader sheets follow the page theme, not the system appearance. */
  dark?: boolean;
  /** Title colour; reader sheets pass the page theme's own text colour. */
  fg?: string;
}

/** A glass bottom sheet that floats above the page, Apple Books style. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  maxHeight = '76%',
  scroll = true,
  dark,
  fg,
}: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = dark ?? theme.scheme === 'dark';
  // Every colour follows `isDark`, never the app palette: a reader sheet over
  // a light page while the app is in dark mode used to get near-white text.
  const titleColor = fg ?? (isDark ? '#F2EFEA' : '#181513');
  const closeBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,22,16,0.07)';
  const closeFg = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(24,21,19,0.55)';

  const Body = scroll ? ScrollView : View;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(280)} exiting={FadeOut.duration(200)} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: theme.overlay }} onPress={onClose} />
      </Animated.View>

      <Animated.View
        // A spring overshoots and reads as a pop; this is the curve iOS uses for
        // its own sheets, so the panel just rises and settles.
        entering={SlideInDown.duration(340).easing(SHEET_IN)}
        exiting={SlideOutDown.duration(240).easing(SHEET_OUT)}
        // Content that grows or shrinks (a tab switch, Customize opening)
        // pushes the top edge up or down; this eases it instead of snapping.
        layout={LinearTransition.duration(260).easing(SHEET_IN)}
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: Math.max(insets.bottom, 10),
          maxHeight: maxHeight as unknown as number,
        }}
      >
        <GlassSurface
          radius={radius.xl}
          colorScheme={isDark ? 'dark' : 'light'}
          style={{
            borderRadius: radius.xl,
            overflow: 'hidden',
            backgroundColor: isDark ? 'rgba(28,26,32,0.88)' : 'rgba(252,250,246,0.9)',
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
            <Text style={[type_.title3, { color: titleColor }]}>{title}</Text>
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
            style={scroll ? { flexGrow: 0 } : undefined}
            contentContainerStyle={
              scroll ? { paddingBottom: 22 } : undefined
            }
            showsVerticalScrollIndicator={false}
          >
            {children}
          </Body>
        </GlassSurface>
      </Animated.View>
    </Modal>
  );
}
