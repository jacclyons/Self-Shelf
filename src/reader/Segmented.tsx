import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { textOn } from '@/ui/accents';
import { Press } from '@/ui/Press';
import { radius, type as type_ } from '@/ui/theme';

/** Stiff and well damped: the pill lands where you tapped without a wobble. */
const SLIDE = { damping: 26, stiffness: 320, mass: 0.8 };

export interface SegmentOption<T> {
  label: string;
  value: T;
}

interface SegmentedProps<T> {
  value: T;
  options: SegmentOption<T>[];
  onChange(value: T): void;
  /** Track colour; the selected pill is always the accent. */
  background: string;
  accent: string;
  /** Label colour for the unselected options. */
  fg: string;
  /** Slightly taller in the appearance panel than in the contents tabs. */
  height?: number;
}

/**
 * A segmented control whose selected pill glides between options instead of
 * jumping. The pill is one absolutely positioned view under the labels, moved
 * with a spring, so the labels themselves never re-layout on a tap.
 */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  background,
  accent,
  fg,
  height = 36,
}: SegmentedProps<T>) {
  const [trackWidth, setTrackWidth] = useState(0);
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const position = useSharedValue(index);

  useEffect(() => {
    position.value = withSpring(index, SLIDE);
  }, [index, position]);

  const inset = 3;
  const segment = trackWidth > 0 ? (trackWidth - inset * 2) / options.length : 0;

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value * segment }],
  }));

  return (
    <View
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row',
        backgroundColor: background,
        borderRadius: radius.md,
        padding: inset,
      }}
    >
      {segment > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: inset,
              left: inset,
              width: segment,
              height,
              borderRadius: radius.md - inset,
              backgroundColor: accent,
            },
            pillStyle,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Press
            key={String(option.value)}
            haptic="selection"
            scaleTo={0.97}
            style={{ flex: 1 }}
            onPress={() => onChange(option.value)}
          >
            <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
              <Text
                style={[
                  type_.footnote,
                  { color: selected ? textOn(accent) : fg, fontWeight: selected ? '600' : '400' },
                ]}
              >
                {option.label}
              </Text>
            </View>
          </Press>
        );
      })}
    </View>
  );
}
