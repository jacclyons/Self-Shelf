/**
 * A cloth bookmark ribbon that hangs down the right edge of the page while the
 * current page is bookmarked and the reader chrome is up. It's drawn once in
 * SVG in the reader's accent colour: a horizontal gradient rounds the strip,
 * a twill pattern gives it a weave, a dashed inset line stitches the hem, and
 * a swallowtail notch cuts the tail, and it casts a halftone shadow like the
 * shelf does. Its top is hidden under the header bar,
 * so it reads as tucked into the spine. It stays mounted and only slides,
 * because sliding back up as the chrome fades is the whole point.
 */

import { useEffect, useId, useMemo } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Pattern, Stop } from 'react-native-svg';

import { polygonShadowDots } from '@/ui/Halftone';
import { useReduceMotion } from '@/ui/motion';

export const RIBBON_WIDTH = 52;

/** Depth of the swallowtail cut at the bottom. */
const NOTCH = 22;
/** How far the shadow's dots reach past the ribbon's edge. */
const SHADOW_SPREAD = 8;
/** Room around the ribbon for the shadow, on every side. */
const SHADOW_ROOM = SHADOW_SPREAD + 6;

interface RibbonBookmarkProps {
  visible: boolean;
  /** Full drawn length, from the top of the screen to the tips of the tail. */
  length: number;
  color: string;
  dark: boolean;
  style?: StyleProp<ViewStyle>;
}

export function RibbonBookmark({ visible, length, color, dark, style }: RibbonBookmarkProps) {
  const reduceMotion = useReduceMotion();
  // Hidden is fully above the screen, shadow included.
  const hidden = -(length + SHADOW_ROOM + 4);
  const drop = useSharedValue(hidden);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      drop.value = visible ? 0 : hidden;
      fade.value = withTiming(visible ? 1 : 0, { duration: 200 });
      return;
    }
    fade.value = 1;
    if (visible) {
      // Straight down, and it arrives: a cubic ease-out stops cleanly rather
      // than trailing off the way a spring does.
      drop.value = withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) });
    } else {
      // Pulled back up a little quicker, gathering speed as it goes.
      drop.value = withTiming(hidden, { duration: 320, easing: Easing.in(Easing.quad) });
    }
  }, [drop, fade, hidden, reduceMotion, visible]);

  const animated = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: drop.value }],
  }));

  const uid = useId().replace(/:/g, '');
  const weaveId = `weave-${uid}`;
  const roundId = `round-${uid}`;
  const tailId = `tail-${uid}`;

  const width = RIBBON_WIDTH;
  const height = length + SHADOW_ROOM;
  // Swallowtail: down the left edge, up into the notch, down to the right tip.
  const points = useMemo(
    (): [number, number][] => [[0, 0], [width, 0], [width, length], [width / 2, length - NOTCH], [0, length]],
    [width, length],
  );
  const outline = useMemo(() => `M${points.map(([x, y]) => `${x} ${y}`).join(' L')} Z`, [points]);
  // The shadow's top edge is off the top of the screen, so it never shows as a
  // dotted band under the header.
  const shadowDots = useMemo(
    () => polygonShadowDots([[0, -SHADOW_ROOM * 2], [width, -SHADOW_ROOM * 2], ...points.slice(2)], {
      spread: SHADOW_SPREAD,
      offsetX: 2,
      offsetY: 4,
      pitch: 3.5,
      maxRadius: 1.15,
    }),
    [points, width],
  );
  // The hem sits 3px inside the outline and follows the notch.
  const hem = useMemo(() => {
    const i = 5;
    const tip = length - i * 1.6;
    return `M${i} 0 V${tip} L${width / 2} ${length - NOTCH - i * 0.4} L${width - i} ${tip} V0`;
  }, [width, length]);

  const shadowColor = dark ? '#000000' : '#1A1208';
  const svg = useMemo(
    () => (
      <Svg width={width + SHADOW_ROOM * 2} height={height} viewBox={`${-SHADOW_ROOM} 0 ${width + SHADOW_ROOM * 2} ${height}`}>
        <Defs>
          <LinearGradient id={roundId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#000" stopOpacity={0.22} />
            <Stop offset="0.18" stopColor="#fff" stopOpacity={0.0} />
            <Stop offset="0.42" stopColor="#fff" stopOpacity={0.14} />
            <Stop offset="0.8" stopColor="#000" stopOpacity={0.04} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.26} />
          </LinearGradient>
          <LinearGradient id={tailId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={0.0} />
            <Stop offset="0.82" stopColor="#000" stopOpacity={0.0} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.14} />
          </LinearGradient>
          {/* A twill: one diagonal thread and one crossing it, both faint, so
              the weave shows as texture rather than stripes. */}
          <Pattern id={weaveId} patternUnits="userSpaceOnUse" width={5} height={5}>
            <Line x1={0} y1={5} x2={5} y2={0} stroke="#fff" strokeOpacity={0.16} strokeWidth={1.1} />
            <Line x1={0} y1={0} x2={5} y2={5} stroke="#000" strokeOpacity={0.09} strokeWidth={0.8} />
            <Line x1={0} y1={2.5} x2={5} y2={2.5} stroke="#000" strokeOpacity={0.05} strokeWidth={0.6} />
          </Pattern>
        </Defs>

        {shadowDots.map((dot, i) => (
          <Circle key={i} cx={dot.x} cy={dot.y} r={dot.r} fill={shadowColor} fillOpacity={dark ? 0.45 : 0.22} />
        ))}

        <Path d={outline} fill={color} />
        <Path d={outline} fill={`url(#${weaveId})`} />
        <Path d={outline} fill={`url(#${roundId})`} />
        <Path d={outline} fill={`url(#${tailId})`} />
        {/* Stitched hem. */}
        <Path d={hem} fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={1.2} strokeDasharray="3.6 3" strokeLinecap="round" />
        {/* A hairline of shade along the cut edge gives the cloth thickness. */}
        <Path d={outline} fill="none" stroke="#000" strokeOpacity={0.18} strokeWidth={1} />
      </Svg>
    ),
    [color, dark, height, hem, outline, roundId, shadowColor, shadowDots, tailId, weaveId, width],
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', top: 0, width: width + SHADOW_ROOM * 2, height },
        style,
        animated,
      ]}
    >
      {svg}
    </Animated.View>
  );
}
