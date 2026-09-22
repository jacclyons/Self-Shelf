import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The accessibility props matter where the content says nothing, e.g. a colour swatch. */
interface PressProps
  extends Pick<PressableProps, 'role' | 'aria-label' | 'aria-checked' | 'aria-selected' | 'aria-expanded'> {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: 'light' | 'medium' | 'selection' | false;
  disabled?: boolean;
  hitSlop?: number;
}

/** Everything tappable gets the same critically-damped squeeze and a tick of haptics. */
export function Press({
  children,
  onPress,
  onLongPress,
  style,
  scaleTo = 0.955,
  haptic = 'light',
  disabled,
  hitSlop,
  ...accessibility
}: PressProps) {
  const pressed = useSharedValue(0);
  // A pointer expects something to happen before it commits to a click.
  const hovered = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: withSpring(1 - pressed.value * (1 - scaleTo), { damping: 22, stiffness: 340 }) },
    ],
    opacity: withSpring(1 - pressed.value * 0.12 - hovered.value * 0.08, {
      damping: 22,
      stiffness: 340,
    }),
  }));

  return (
    <AnimatedPressable
      {...accessibility}
      disabled={disabled}
      hitSlop={hitSlop}
      onHoverIn={Platform.OS === 'web' ? () => { hovered.value = 1; } : undefined}
      onHoverOut={Platform.OS === 'web' ? () => { hovered.value = 0; } : undefined}
      onPressIn={() => {
        pressed.value = 1;
      }}
      onPressOut={() => {
        pressed.value = 0;
        hovered.value = 0;
      }}
      onPress={() => {
        if (haptic === 'selection') Haptics.selectionAsync();
        else if (haptic) {
          Haptics.impactAsync(
            haptic === 'medium'
              ? Haptics.ImpactFeedbackStyle.Medium
              : Haptics.ImpactFeedbackStyle.Light,
          );
        }
        onPress?.();
      }}
      onLongPress={onLongPress}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
