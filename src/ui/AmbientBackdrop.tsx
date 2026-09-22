/**
 * A slow drift of colour behind the Library, so the page feels lit rather
 * than flat. Everything here is in the accent, so the page never goes grey:
 * an oversized glow rising from the bottom that sways a little and leans a
 * few degrees over about twenty seconds, and over it a halftone screen of
 * accent dots on an upright square grid that grow towards the bottom of the page,
 * the way a printed tone ramp does. Slow waves of darker and lighter dots roll
 * diagonally through that fixed grid. The dots are vector circles, crisp at any pixel
 * density. Reduce Motion freezes the drift at the midpoint, which is still a
 * soft gradient, and stills the waves.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, Pattern } from 'react-native-svg';

import { useReduceMotion } from './motion';
import { useTheme } from './theme';

/** One full wander, out and back, takes twice this. */
const DRIFT_MS = 20000;

/** Centre-to-centre spacing of the halftone dots. */
const DOT_PITCH = 7;

/**
 * Diagonal bands reveal an upright dot pattern, each at its own radius and
 * animated opacity. Only the band outlines are angled: their SVG viewBoxes
 * share screen coordinates, so the dots align across joins without rotating
 * either the views or the pattern. Opacity remains a plain view property the
 * UI thread can drive every frame. Around 30pt per band keeps the tone steps
 * small enough that they don't read as stripes.
 */
const BAND_HEIGHT = 30;

/** Dot radius at the top and bottom of the page. */
const DOT_MIN = 0.45;
const DOT_MAX = 2.0;

/** One wave crest to the next, in points, and how long a crest takes to travel that far. */
const WAVELENGTH = 440;
const WAVE_MS = 9000;

/**
 * The wave fronts lean up to the right. This angle only defines the band
 * boundaries and wave phase; the dot grid itself stays square to the screen.
 */
const WAVE_ANGLE = -18;

/**
 * How far a band's opacity swings from its resting value: further down into
 * a trough than up into a crest, so the darkest dots stay gentle while the
 * waves still read.
 */
const WAVE_CREST = 0.3;
const WAVE_TROUGH = 0.8;

/**
 * A second, independent wave changes only the dots' size, not their ink, so
 * it reads as the screen breathing rather than as light and shade. It has its
 * own wavelength and speed, so the two never fall into step. A pattern's
 * circle can't be animated on the native side, so each band carries two
 * grids on the same positions, one of slightly smaller dots and one of
 * slightly larger, and crossfades between them.
 */
const RIPPLE_LENGTH = 300;
const RIPPLE_MS = 13000;
const DOT_SWELL = 0.14;

/** `#RRGGBB` plus an opacity. The gradients fade to the same hue at zero
 *  alpha rather than to `transparent`, which iOS would render as a dark fringe. */
function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function AmbientBackdrop() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const { width, height } = useWindowDimensions();

  // 0 → 1 → 0, forever. Both layers read it, moving in opposite directions.
  const drift = useSharedValue(0.5);

  // 0 → 1 and wraps: one wavelength of travel. Every band reads it with its
  // own offset, so a crest rolls smoothly up the page.
  const wave = useSharedValue(0);
  const ripple = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      drift.value = 0.5;
      wave.value = 0;
      ripple.value = 0;
      return;
    }
    drift.value = 0;
    drift.value = withRepeat(
      withTiming(1, { duration: DRIFT_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    wave.value = 0;
    wave.value = withRepeat(withTiming(1, { duration: WAVE_MS, easing: Easing.linear }), -1, false);
    ripple.value = 0;
    ripple.value = withRepeat(
      withTiming(1, { duration: RIPPLE_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(drift);
      cancelAnimation(wave);
      cancelAnimation(ripple);
    };
  }, [drift, reduceMotion, ripple, wave]);

  // Oversized so the edges never show, whatever the drift and rotation.
  const size = Math.max(width, height) * 1.6;

  // The accent rises from the bottom edge like a glow under the shelf, sways
  // a little side to side and breathes up and down.
  const accentStyle = useAnimatedStyle(() => {
    const t = drift.value - 0.5;
    return {
      transform: [
        { translateX: t * width * 0.4 },
        { translateY: -Math.abs(t) * height * 0.12 },
        { rotate: `${t * 8}deg` },
      ],
    };
  });

  const dark = theme.scheme === 'dark';
  const accentAlpha = dark ? 0.24 : 0.18;
  // The accent has less contrast against the paper than ink would, so the
  // dots can sit a little heavier and still read as tint rather than grey.
  const dotOpacity = dark ? 0.24 : 0.17;

  // Project the screen corners onto the wave's axis, not the dot grid.
  // This covers both portrait and landscape without an oversized rotated view.
  const angle = (WAVE_ANGLE * Math.PI) / 180;
  const across = -width * Math.sin(angle);
  const down = height * Math.cos(angle);
  const firstLevel = Math.floor(Math.min(0, across) / BAND_HEIGHT) * BAND_HEIGHT;
  const lastLevel = down + Math.max(0, across);

  // Keep the whole top edge light and gather the weight at the bottom.
  const rampStart = Math.max(0, across);
  const rampLength = Math.max(BAND_HEIGHT, down - Math.abs(across));
  const bandCount = Math.ceil((lastLevel - firstLevel) / BAND_HEIGHT);
  const bands = Array.from({ length: bandCount }, (_, i) => {
    const level = firstLevel + i * BAND_HEIGHT;
    const t = Math.min(1, Math.max(0, (level + BAND_HEIGHT / 2 - rampStart) / rampLength));
    return { level, radius: DOT_MIN + (DOT_MAX - DOT_MIN) * t ** 1.4 };
  });

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size,
            height: size,
            bottom: -size * 0.55,
            left: (width - size) / 2,
          },
          accentStyle,
        ]}
      >
        <LinearGradient
          colors={[rgba(theme.tint, 0), rgba(theme.tint, accentAlpha)]}
          locations={[0.08, 0.45]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {bands.map(({ level, radius }, i) => (
        <HalftoneBand
          key={i}
          index={i}
          level={level}
          width={width}
          radius={radius}
          color={theme.tint}
          opacity={dotOpacity}
          wave={wave}
          ripple={ripple}
        />
      ))}
    </View>
  );
}

interface HalftoneBandProps {
  index: number;
  /** Distance along the diagonal wave axis, in screen points. */
  level: number;
  width: number;
  radius: number;
  color: string;
  /** The band's resting opacity; the wave swings it either side of this. */
  opacity: number;
  wave: SharedValue<number>;
  ripple: SharedValue<number>;
}

function HalftoneBand({
  index,
  level,
  width,
  radius,
  color,
  opacity,
  wave,
  ripple,
}: HalftoneBandProps) {
  // Two sines an irrational ratio apart, so the pattern of crests never
  // quite repeats and reads as water rather than a metronome. The sign on
  // `wave` sends the crests upward, out of the accent glow.
  const phase = ((level + BAND_HEIGHT / 2) / WAVELENGTH) * Math.PI * 2;
  const swellAt = (t: number) => {
    'worklet';
    return Math.sin(phase + t) * 0.65 + Math.sin(phase * 1.618 + t * 0.7 + 1.3) * 0.35;
  };
  // The band's ink follows the light wave. The ripple then decides how that
  // ink is split between the two grids, so the total stays put while the dot
  // size shifts, and the two effects stay independent.
  const ripplePhase = ((level + BAND_HEIGHT / 2) / RIPPLE_LENGTH) * Math.PI * 2;
  const smallStyle = useAnimatedStyle(() => {
    const swell = swellAt(wave.value * Math.PI * 2);
    const ink = opacity * (1 + swell * (swell > 0 ? WAVE_CREST : WAVE_TROUGH));
    const large = (Math.sin(ripplePhase + ripple.value * Math.PI * 2) + 1) / 2;
    return { opacity: ink * (1 - large) };
  });
  const largeStyle = useAnimatedStyle(() => {
    const swell = swellAt(wave.value * Math.PI * 2);
    const ink = opacity * (1 + swell * (swell > 0 ? WAVE_CREST : WAVE_TROUGH));
    const large = (Math.sin(ripplePhase + ripple.value * Math.PI * 2) + 1) / 2;
    return { opacity: ink * large };
  });

  // Solve y·cos(angle) − x·sin(angle) = level at each screen edge.
  // The parallelogram clips the pattern; its bounding view never rotates.
  const angle = (WAVE_ANGLE * Math.PI) / 180;
  const leftY = level / Math.cos(angle);
  const rightY = leftY + width * Math.tan(angle);
  const bandHeight = BAND_HEIGHT / Math.cos(angle);
  const top = Math.min(leftY, rightY);
  const h = Math.abs(rightY - leftY) + bandHeight;
  const outline = `M0 ${leftY} L${width} ${rightY} L${width} ${rightY + bandHeight} L0 ${leftY + bandHeight} Z`;
  const id = `halftone-${index}`;

  const grid = (suffix: string, r: number) => (
    <Svg width={width} height={h} viewBox={`0 ${top} ${width} ${h}`}>
      <Defs>
        <Pattern id={`${id}${suffix}`} patternUnits="userSpaceOnUse" width={DOT_PITCH} height={DOT_PITCH}>
          <Circle cx={DOT_PITCH / 2} cy={DOT_PITCH / 2} r={r} fill={color} />
        </Pattern>
      </Defs>
      <Path d={outline} fill={`url(#${id}${suffix})`} />
    </Svg>
  );

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top, left: 0, width, height: h }}>
      <Animated.View style={[StyleSheet.absoluteFill, smallStyle]}>
        {grid('s', radius * (1 - DOT_SWELL / 2))}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, largeStyle]}>
        {grid('l', radius * (1 + DOT_SWELL / 2))}
      </Animated.View>
    </View>
  );
}
