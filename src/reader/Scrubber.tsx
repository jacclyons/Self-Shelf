import { useCallback } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

interface ScrubberProps {
  percent: number;
  width: number;
  onSeek(percent: number): void;
  onScrubbing?(active: boolean, percent: number): void;
  color: string;
  trackColor: string;
}

const TRACK_HEIGHT = 4;
const KNOB = 16;

/** Drag-anywhere progress bar that fattens under your thumb. */
export function Scrubber({
  percent,
  width,
  onSeek,
  onScrubbing,
  color,
  trackColor,
}: ScrubberProps) {
  const dragging = useSharedValue(0);
  const dragPercent = useSharedValue(percent);

  const usable = Math.max(1, width - KNOB);

  const report = useCallback(
    (active: boolean, value: number) => onScrubbing?.(active, value),
    [onScrubbing],
  );

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      dragging.value = 1;
      dragPercent.value = Math.max(0, Math.min(1, (event.x - KNOB / 2) / usable));
      runOnJS(report)(true, dragPercent.value);
    })
    .onUpdate((event) => {
      dragPercent.value = Math.max(0, Math.min(1, (event.x - KNOB / 2) / usable));
      runOnJS(report)(true, dragPercent.value);
    })
    .onEnd(() => {
      runOnJS(onSeek)(dragPercent.value);
    })
    .onFinalize(() => {
      dragging.value = 0;
      runOnJS(report)(false, dragPercent.value);
    });

  const trackStyle = useAnimatedStyle(() => ({
    height: withSpring(TRACK_HEIGHT + dragging.value * 4, { damping: 20, stiffness: 280 }),
  }));

  const fillStyle = useAnimatedStyle(() => {
    const value = dragging.value ? dragPercent.value : percent;
    return { width: `${Math.max(0, Math.min(1, value)) * 100}%` };
  });

  const knobStyle = useAnimatedStyle(() => {
    const value = dragging.value ? dragPercent.value : percent;
    return {
      transform: [
        { translateX: value * usable },
        { scale: withSpring(dragging.value ? 1.25 : 1, { damping: 18, stiffness: 300 }) },
      ],
      opacity: withSpring(dragging.value ? 1 : 0.9),
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ width, height: 34, justifyContent: 'center' }} hitSlop={12}>
        <Animated.View
          style={[
            {
              width: '100%',
              borderRadius: 6,
              backgroundColor: trackColor,
              overflow: 'hidden',
            },
            trackStyle,
          ]}
        >
          <Animated.View
            style={[{ height: '100%', borderRadius: 6, backgroundColor: color }, fillStyle]}
          />
        </Animated.View>

        <Animated.View
          style={[
            {
              position: 'absolute',
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              backgroundColor: color,
              shadowColor: '#000',
              shadowOpacity: 0.22,
              shadowRadius: 5,
              shadowOffset: { width: 0, height: 2 },
            },
            knobStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
}
