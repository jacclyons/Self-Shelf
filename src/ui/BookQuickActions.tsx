import { useCallback, useMemo } from 'react';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

import type { Session } from '@/api/client';
import type { BaseItem } from '@/api/types';

import { BookCover } from './BookCover';
import { Icon } from './Bits';
import { GlassSurface } from './Glass';
import { Press } from './Press';
import { radius, type as type_, useTheme } from './theme';

export interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QuickAction {
  key: string;
  label: string;
  icon: Parameters<typeof Icon>[0]['name'];
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onPress(): void;
}

interface BookQuickActionsProps {
  visible: boolean;
  onClose(): void;
  item: BaseItem;
  session: Session;
  anchor: Anchor | null;
  actions: QuickAction[];
}

const MENU_WIDTH = 240;
const ROW_HEIGHT = 50;
const GAP = 12;

/**
 * The iOS long-press pattern: the rest of the screen recedes, the cover lifts
 * where it already sits, and the actions appear beside it.
 */
export function BookQuickActions({
  visible,
  onClose,
  item,
  session,
  anchor,
  actions,
}: BookQuickActionsProps) {
  const theme = useTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const layout = useMemo(() => {
    if (!anchor) return null;

    // Lift the cover slightly, keeping it where the reader's eye already is.
    const scale = 1.06;
    const coverW = anchor.width * scale;
    const coverH = anchor.height * scale;
    let coverX = anchor.x - (coverW - anchor.width) / 2;
    let coverY = anchor.y - (coverH - anchor.height) / 2;

    coverX = Math.max(16, Math.min(coverX, screenW - coverW - 16));

    const menuH = actions.length * ROW_HEIGHT + 8;
    // Prefer below the cover; flip above when there isn't room.
    let menuY = coverY + coverH + GAP;
    if (menuY + menuH > screenH - 40) {
      menuY = coverY - GAP - menuH;
      if (menuY < 60) {
        // Neither fits: pin the pair vertically centred instead.
        coverY = Math.max(70, (screenH - coverH - menuH - GAP) / 2);
        menuY = coverY + coverH + GAP;
      }
    }

    let menuX = coverX + coverW / 2 - MENU_WIDTH / 2;
    menuX = Math.max(16, Math.min(menuX, screenW - MENU_WIDTH - 16));

    return { coverX, coverY, coverW, menuX, menuY };
  }, [actions.length, anchor, screenH, screenW]);

  const run = useCallback(
    (action: QuickAction) => {
      onClose();
      // Let the dismissal start before the list re-sorts underneath.
      setTimeout(action.onPress, 60);
    },
    [onClose],
  );

  if (!layout) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(160)}
        style={{ flex: 1 }}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: theme.scheme === 'dark' ? 'rgba(0,0,0,0.62)' : 'rgba(20,16,12,0.34)',
          }}
          onPress={onClose}
        />
      </Animated.View>

      <Animated.View
        entering={ZoomIn.duration(220).easing(Easing.bezier(0.2, 0.9, 0.2, 1))}
        exiting={FadeOut.duration(140)}
        style={{ position: 'absolute', left: layout.coverX, top: layout.coverY }}
        pointerEvents="none"
      >
        <BookCover item={item} session={session} width={layout.coverW} elevation="high" radius={8} />
      </Animated.View>

      <Animated.View
        entering={FadeIn.duration(200).delay(40)}
        exiting={FadeOut.duration(140)}
        style={{ position: 'absolute', left: layout.menuX, top: layout.menuY, width: MENU_WIDTH }}
      >
        <GlassSurface
          radius={radius.lg}
          style={{
            borderRadius: radius.lg,
            overflow: 'hidden',
            paddingVertical: 4,
            backgroundColor:
              theme.scheme === 'dark' ? 'rgba(38,36,42,0.9)' : 'rgba(250,248,245,0.92)',
          }}
        >
          {actions.map((action, index) => (
            <Press
              key={action.key}
              haptic="light"
              scaleTo={0.98}
              disabled={action.disabled}
              onPress={() => run(action)}
            >
              <View
                style={{
                  height: ROW_HEIGHT,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  opacity: action.disabled ? 0.4 : 1,
                  borderTopWidth: index === 0 ? 0 : 0.5,
                  borderTopColor: theme.separator,
                }}
              >
                <Text
                  style={[
                    type_.callout,
                    { color: action.destructive ? theme.destructive : theme.text },
                  ]}
                >
                  {action.label}
                </Text>
                <Icon
                  name={action.icon}
                  size={17}
                  color={
                    action.destructive
                      ? theme.destructive
                      : action.active
                        ? theme.tint
                        : theme.textSecondary
                  }
                />
              </View>
            </Press>
          ))}
        </GlassSurface>
      </Animated.View>
    </Modal>
  );
}
