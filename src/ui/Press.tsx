import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressProps {
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
}: PressProps) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: withSpring(1 - pressed.value * (1 - scaleTo), { damping: 22, stiffness: 340 }) },
    ],
    opacity: withSpring(1 - pressed.value * 0.12, { damping: 22, stiffness: 340 }),
  }));

  return (
    <AnimatedPressable
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => {
        pressed.value = 1;
      }}
      onPressOut={() => {
        pressed.value = 0;
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
