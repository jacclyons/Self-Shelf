/**
 * The 3D shelf: one book faces you, and the rest stand beside it as spines.
 *
 * Every book is two faces hinged on a shared vertical edge — the spine to the
 * left of the hinge, the cover to the right — and a single angle turns it.
 * At 0° the spine faces you and the cover is edge-on, receding into the shelf;
 * at 90° the cover faces you and the spine is edge-on. React Native has no
 * `translateZ`, so a hinge is the only way to get real depth from its
 * transforms, and it happens to be exactly how a book behaves anyway.
 *
 * Layout is driven by one shared value, `position`: a fractional index of the
 * book at the centre. A book's horizontal slot is a linear ramp from spine
 * width to cover width as it approaches the centre, rather than its true
 * projected width, so the stacks on either side hold still while the middle
 * pair swaps over. (Projected widths would make the shelf breathe outward
 * mid-turn.) The turning pair overlap each other a little as a result, which
 * reads as two books passing rather than as a bug.
 */

import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  type SharedValue,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, Pattern } from 'react-native-svg';

import type { Session } from '@/api/client';
import { authorOf, type BaseItem } from '@/api/types';

import { textOn } from './accents';
import { BookCover, COVER_RATIO } from './BookCover';
import { spineColor } from './coverColor';
import { HalftoneShade } from './Halftone';

// `Polygon` is a JS wrapper that turns `points` into a path on render, so an
// animated `points` never reaches the native view; a `Path`'s `d` does.
const AnimatedPath = Animated.createAnimatedComponent(Path);
import { useReduceMotion } from './motion';
import { Press } from './Press';
import { Shelf } from './Shelf';
import { serif, useTheme } from './theme';

/** Uniform spines: wide enough for a rotated title and a comfortable tap. */
const SPINE = 30;

/** Air between books, so the spines read as separate volumes rather than a wall. */
const GAP = 8;

/** The distance from one spine to the next. */
const PITCH = SPINE + GAP;

/** Books on the shelf stand a little shorter than the one you've pulled out. */
const SIDE_SCALE = 0.88;

/** Books mounted either side of the centre. Beyond this they're off screen. */
const WINDOW = 5;

/**
 * Critically damped (ζ ≈ 1.05): lands in roughly 400ms with no overshoot, so
 * a cover never swings past face-on and back.
 */
const SNAP = { damping: 26, stiffness: 170, mass: 0.9 } as const;

/** How much of a drag past either end actually moves the shelf. */
const RUBBER = 0.3;

/** How far a flick carries, in books per unit of velocity. */
const FLING = 0.15;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

function rubberBand(value: number, min: number, max: number): number {
  'worklet';
  if (value < min) return min - (min - value) * RUBBER;
  if (value > max) return max + (value - max) * RUBBER;
  return value;
}

interface ShelfCarouselProps {
  items: BaseItem[];
  session: Session;
  /** Called as the centre nears the end of `items`, for paged libraries. */
  onNearEnd?: () => void;
}

export function ShelfCarousel({ items, session, onNearEnd }: ShelfCarouselProps) {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();

  // The pulled-out book is the point of the view, so it takes most of the
  // width; the spines only need enough room to be read and tapped.
  const coverWidth = Math.min(300, Math.round(width * 0.72));
  const coverHeight = Math.round(coverWidth / COVER_RATIO);
  const last = Math.max(0, items.length - 1);

  const position = useSharedValue(0);
  const dragStart = useSharedValue(0);
  // Where the shelf is heading, as opposed to where it is mid-spring, so a
  // run of key presses steps one book each rather than re-rounding the turn.
  const target = useSharedValue(0);
  const [center, setCenter] = useState(0);

  // A filter change can leave the centre past the end of the new list.
  useEffect(() => {
    if (center > last) {
      position.value = last;
      target.value = last;
      setCenter(last);
    }
  }, [center, last, position, target]);

  useEffect(() => {
    if (onNearEnd && items.length && center >= items.length - 4) onNearEnd();
  }, [center, items.length, onNearEnd]);

  const settle = useCallback((index: number) => {
    setCenter(index);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }, []);

  // One tick per book passed, however fast the flick. The rubber band never
  // rounds past the ends, so there's nothing to fire there.
  useAnimatedReaction(
    () => Math.round(clamp(position.value, 0, last)),
    (current, previous) => {
      if (previous !== null && current !== previous) runOnJS(settle)(current);
    },
    [last],
  );

  const goTo = useCallback(
    (index: number) => {
      target.value = clamp(index, 0, last);
      position.value = withSpring(target.value, SNAP);
    },
    [last, position, target],
  );

  const open = useCallback(
    (item: BaseItem) => router.push({ pathname: '/book/[id]', params: { id: item.Id } }),
    [router],
  );

  // A keyboard walks the shelf too: arrows step, Home and End jump, Enter
  // opens the book that's facing you. Only while this screen is the one on
  // show, and never while something is being typed.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web') return;
      const onKey = (event: KeyboardEvent) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const el = event.target as HTMLElement | null;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
        switch (event.key) {
          case 'ArrowLeft':
            goTo(target.value - 1);
            break;
          case 'ArrowRight':
            goTo(target.value + 1);
            break;
          case 'Home':
            goTo(0);
            break;
          case 'End':
            goTo(last);
            break;
          case 'Enter': {
            const item = items[Math.round(target.value)];
            if (item) open(item);
            break;
          }
          default:
            return;
        }
        event.preventDefault();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [goTo, items, last, open, target]),
  );

  // Dragging a cover's width turns exactly one book, so the centred cover
  // tracks the finger one-to-one and the spines follow at their own pace.
  // Nothing scrolls vertically behind the shelf, so the pan can claim a touch
  // after only a few points.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-6, 6])
        .onBegin(() => {
          // A finger landing mid-spring takes over from wherever the shelf is.
          cancelAnimation(position);
          dragStart.value = position.value;
        })
        .onUpdate((event) => {
          position.value = rubberBand(dragStart.value - event.translationX / coverWidth, 0, last);
        })
        .onEnd((event) => {
          const projected = position.value - (event.velocityX / coverWidth) * FLING;
          target.value = clamp(Math.round(projected), 0, last);
          position.value = withSpring(target.value, SNAP);
        }),
    [coverWidth, dragStart, last, position, target],
  );

  if (!items.length) return null;

  // Reduce Motion asks for no 3D turn, so the same books go in a flat,
  // snapping row: it slides, it doesn't swing.
  if (reduceMotion) {
    return (
      <View style={{ paddingVertical: 24 }}>
        <Shelf items={items} session={session} tileWidth={coverWidth * 0.6} />
      </View>
    );
  }

  const first = Math.max(0, center - WINDOW);
  const visible = items.slice(first, Math.min(items.length, center + WINDOW + 1));

  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <GestureDetector gesture={pan}>
        <View style={{ height: coverHeight }}>
          {/* The books, laid out from a centred origin so the maths can stay signed. */}
          <View style={{ height: coverHeight, alignItems: 'center' }}>
            <View style={{ width: 0, height: coverHeight, overflow: 'visible' }}>
              {visible.map((item, offset) => {
                const index = first + offset;
                return (
                  <Book
                    key={item.Id}
                    item={item}
                    session={session}
                    index={index}
                    position={position}
                    coverWidth={coverWidth}
                    coverHeight={coverHeight}
                    // Only the centre and its neighbours ever show their art; the
                    // rest are edge-on, so a flat fill costs nothing and saves a decode.
                    art={Math.abs(index - center) <= 1}
                  />
                );
              })}
            </View>

            {/*
              Taps go to a flat overlay rather than the rotated faces: iOS
              won't deliver a touch to a child outside its parent's bounds,
              and every spine hangs outside its book's box. The overlay is laid
              out for the settled state, which is the only time anyone taps.
            */}
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              {visible.map((item, offset) => {
                const d = first + offset - center;
                const left =
                  d === 0
                    ? -coverWidth / 2
                    : d < 0
                      ? d * PITCH - coverWidth / 2
                      : d * PITCH + coverWidth / 2 - SPINE;
                return (
                  <Press
                    key={item.Id}
                    haptic={d === 0 ? 'medium' : 'selection'}
                    scaleTo={1}
                    aria-label={item.Name ?? 'Book'}
                    onPress={() => (d === 0 ? open(item) : goTo(center + d))}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '50%',
                      marginLeft: left,
                      width: d === 0 ? coverWidth : SPINE,
                      height: coverHeight,
                    }}
                  >
                    <View />
                  </Press>
                );
              })}
            </View>
          </View>
        </View>
      </GestureDetector>

    </View>
  );
}

interface BookProps {
  item: BaseItem;
  session: Session;
  index: number;
  position: SharedValue<number>;
  coverWidth: number;
  coverHeight: number;
  art: boolean;
}

function Book({ item, session, index, position, coverWidth, coverHeight, art }: BookProps) {
  const theme = useTheme();
  const spine = spineColor(item, theme.scheme);
  const onSpine = textOn(spine);
  const author = authorOf(item);

  // Deep enough that a spine reads as a solid edge without the far stacks
  // skewing into a fisheye; roughly four cover widths works on a phone.
  const perspective = coverWidth * 4;

  // See the module comment for the layout. `d` is this book's offset from the
  // centre; `turn` is 1 face-on, 0 spine-on; `hinge` is the shared edge.
  const hingeStyle = useAnimatedStyle(() => {
    const p = position.value;
    const d = index - p;
    const t = p - Math.floor(p);
    const turn = clamp(1 - Math.abs(d), 0, 1);
    const angle = (turn * Math.PI) / 2;

    // The two books either side of the centre are the only ones claiming more
    // than a spine's width. Everything to their right shifts by what they claim.
    const extra = coverWidth - SPINE;
    let shift = 0;
    if (d > -t + 1e-6) shift += extra * (1 - t);
    if (d > 1 - t + 1e-6) shift += extra * t;

    const left = d * PITCH + shift - coverWidth / 2;
    // The pulled-out book grows to full size as it turns, and shrinks back as
    // it returns to the shelf.
    const scale = SIDE_SCALE + (1 - SIDE_SCALE) * turn;
    return { transform: [{ translateX: left + SPINE * Math.cos(angle) }, { scale }] };
  });

  const spineStyle = useAnimatedStyle(() => {
    const turn = clamp(1 - Math.abs(index - position.value), 0, 1);
    return { transform: [{ perspective }, { rotateY: `${-turn * 90}deg` }] };
  });

  const coverStyle = useAnimatedStyle(() => {
    const turn = clamp(1 - Math.abs(index - position.value), 0, 1);
    return {
      transform: [{ perspective }, { rotateY: `${90 - turn * 90}deg` }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: coverWidth,
          height: coverHeight,
          overflow: 'visible',
          // Scale about the middle of the spine, so a shelved book shrinks in
          // place and stays centred in its slot.
          transformOrigin: `${-SPINE / 2}px 50%`,
        },
        hingeStyle,
      ]}
    >
      {/* Cover: hinged on its left edge. Rendered first so the spine paints over it. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            width: coverWidth,
            height: coverHeight,
            transformOrigin: '0% 50%',
            backfaceVisibility: 'hidden',
          },
          coverStyle,
        ]}
      >
        {art ? (
          <BookCover item={item} session={session} width={coverWidth} elevation="none" radius={3} />
        ) : (
          <View style={{ flex: 1, backgroundColor: spine, borderRadius: 3 }} />
        )}
        {/* The fore-edge: a sliver of page block along the side opposite the spine. */}
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', '#EDE6D6', '#D9D1BF']}
          locations={[0, 0.3, 0.6, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 1,
            bottom: 1,
            right: 0,
            width: 7,
            borderTopRightRadius: 3,
            borderBottomRightRadius: 3,
          }}
        />
      </Animated.View>

      {/* Spine: hinged on its right edge, which is the same edge. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: -SPINE,
            top: 0,
            width: SPINE,
            height: coverHeight,
            transformOrigin: '100% 50%',
            backfaceVisibility: 'hidden',
            backgroundColor: spine,
            borderTopLeftRadius: 3,
            borderBottomLeftRadius: 3,
            overflow: 'hidden',
          },
          spineStyle,
        ]}
      >
        {/*
          Cloth rounding as a dot screen: clear down the middle, heavy at both
          edges. Painted on the face only while the book is safely shelved;
          a turning book's screens are drawn flat by `ShadeOverlay` instead,
          so the dots never get squeezed with the face.
        */}
        {art ? null : (
          <HalftoneShade
            width={SPINE}
            height={coverHeight}
            color="#000"
            strips={6}
            pitch={SPINE_PITCH}
            maxRadius={SPINE_DOT}
            profile={spineProfile}
            style={[StyleSheet.absoluteFill, { opacity: SPINE_SHADE }]}
          />
        )}
        {/*
          Spine text runs top to bottom, as on an English binding. The strip is
          laid out as a wide row, then turned a quarter, so both lines fit in
          30pt without any per-character work.
        */}
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <View
            style={{
              width: coverHeight - 24,
              height: SPINE,
              transform: [{ rotate: '90deg' }],
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: onSpine,
                fontFamily: serif,
                fontSize: 12.5,
                fontWeight: '700',
                flexShrink: 1,
              }}
            >
              {item.Name}
            </Text>
            {author ? (
              <Text
                numberOfLines={1}
                style={{
                  color: onSpine,
                  opacity: 0.72,
                  fontSize: 10,
                  fontWeight: '500',
                  flexShrink: 1,
                }}
              >
                {author}
              </Text>
            ) : null}
          </View>
        </View>
      </Animated.View>

      {art ? (
        <ShadeOverlay
          index={index}
          position={position}
          coverWidth={coverWidth}
          coverHeight={coverHeight}
          perspective={perspective}
        />
      ) : null}
    </Animated.View>
  );
}

/* ------------------------------ shade overlay ----------------------------- */

/** Spine screen: dot spacing, full-tone radius, and the layer's opacity. */
const SPINE_PITCH = 4;
const SPINE_DOT = 1.5;
const SPINE_SHADE = 0.28;
const spineProfile = (x: number) => (Math.abs(x - 0.5) * 2) ** 1.6;

/** A light hinge shadow, not a screen over the artwork. */
const COVER_PITCH = 6;
const COVER_DOT = 1.8;
const COVER_SHADE = 0.32;
const COVER_SHADE_FRACTION = 0.2;
const coverProfile = (x: number) => (1 - x) ** 2;

/** Each face is screened in this many strips of tone. */
const STRIPS = 3;

/**
 * Where a point on a face lands on screen. RN's `perspective` puts the
 * vanishing point at the face's transform origin, which for both faces is
 * the hinge at mid-height, so everything is measured from there. `along` is
 * distance from the hinge across the face, `angle` how far the face is turned
 * from the screen plane; the result is the point's screen x from the hinge
 * and how much its height has shrunk.
 */
function project(
  along: number,
  angle: number,
  perspective: number,
  sign: 1 | -1,
): { x: number; shrink: number } {
  'worklet';
  const depth = along * Math.sin(angle);
  const shrink = perspective / (perspective + depth);
  return { x: sign * along * Math.cos(angle) * shrink, shrink };
}

/**
 * A trapezoid for one strip of a face, as a closed path: `a` and `b` are the
 * strip's near and far distances from the hinge. `x` is offset so the overlay's origin (the
 * spine's outer edge) is zero.
 */
function strip(
  a: number,
  b: number,
  angle: number,
  perspective: number,
  sign: 1 | -1,
  height: number,
): string {
  'worklet';
  const mid = height / 2;
  const near = project(a, angle, perspective, sign);
  const far = project(b, angle, perspective, sign);
  const nx = near.x + SPINE;
  const fx = far.x + SPINE;
  const nh = mid * near.shrink;
  const fh = mid * far.shrink;
  return `M${nx} ${mid - nh} L${fx} ${mid - fh} L${fx} ${mid + fh} L${nx} ${mid + nh} Z`;
}

/**
 * Animated path for strip `k` of a face. The cover is turned
 * `90 − turn·90` degrees from the screen plane and the spine `turn·90`; the
 * cover runs right from the hinge, the spine left.
 */
function useStripPoints(
  face: 'cover' | 'spine',
  k: number,
  index: number,
  position: SharedValue<number>,
  coverWidth: number,
  coverHeight: number,
  perspective: number,
) {
  return useAnimatedProps(() => {
    const turn = clamp(1 - Math.abs(index - position.value), 0, 1);
    const angle = ((face === 'cover' ? 1 - turn : turn) * Math.PI) / 2;
    const w = (face === 'cover' ? coverWidth * COVER_SHADE_FRACTION : SPINE) / STRIPS;
    const sign = face === 'cover' ? 1 : -1;
    return { d: strip(k * w, (k + 1) * w, angle, perspective, sign, coverHeight) };
  });
}

interface ShadeOverlayProps {
  index: number;
  position: SharedValue<number>;
  coverWidth: number;
  coverHeight: number;
  perspective: number;
}

/**
 * The halftone shading for a book that may be turning, drawn flat in screen
 * space and clipped to where each face actually lands. Dots painted on a
 * face get squeezed with it as it turns and clump into stripes; here the
 * screen never moves, only the outline that reveals it does. The outline is
 * a path per strip of tone whose outline follows the turn every frame.
 */
function ShadeOverlay({ index, position, coverWidth, coverHeight, perspective }: ShadeOverlayProps) {
  const id = `sh${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const width = SPINE + coverWidth;

  const coverFade = useAnimatedStyle(() => {
    const turn = clamp(1 - Math.abs(index - position.value), 0, 1);
    return { opacity: (1 - turn) ** 1.5 * COVER_SHADE };
  });

  // Hooks can't go in a loop, so the strips are written out.
  const cover0 = useStripPoints('cover', 0, index, position, coverWidth, coverHeight, perspective);
  const cover1 = useStripPoints('cover', 1, index, position, coverWidth, coverHeight, perspective);
  const cover2 = useStripPoints('cover', 2, index, position, coverWidth, coverHeight, perspective);
  const spine0 = useStripPoints('spine', 0, index, position, coverWidth, coverHeight, perspective);
  const spine2 = useStripPoints('spine', 2, index, position, coverWidth, coverHeight, perspective);

  const tone = (profile: (x: number) => number, k: number) =>
    Math.min(1, Math.max(0, profile((k + 0.5) / STRIPS)));

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: -SPINE, top: 0, width, height: coverHeight }}
    >
      {/* Spine strips: always on, since a spine is shaded whether or not it's turning. */}
      <Svg width={width} height={coverHeight} style={{ opacity: SPINE_SHADE }}>
        <Defs>
          {[0, 2].map((k) => (
            <Pattern
              key={k}
              id={`${id}s${k}`}
              patternUnits="userSpaceOnUse"
              width={SPINE_PITCH}
              height={SPINE_PITCH}
              patternTransform="rotate(45)"
            >
              <Circle
                cx={SPINE_PITCH / 2}
                cy={SPINE_PITCH / 2}
                r={SPINE_DOT * Math.sqrt(tone(spineProfile, k))}
                fill="#000"
              />
            </Pattern>
          ))}
        </Defs>
        {/* Spine strips count from the hinge outward; the profile is symmetric. */}
        <AnimatedPath animatedProps={spine0} fill={`url(#${id}s0)`} />
        <AnimatedPath animatedProps={spine2} fill={`url(#${id}s2)`} />
      </Svg>

      <Animated.View style={[StyleSheet.absoluteFill, coverFade]}>
        <Svg width={width} height={coverHeight}>
          <Defs>
            {[0, 1, 2].map((k) => (
              <Pattern
                key={k}
                id={`${id}c${k}`}
                patternUnits="userSpaceOnUse"
                width={COVER_PITCH}
                height={COVER_PITCH}
                patternTransform="rotate(45)"
              >
                <Circle
                  cx={COVER_PITCH / 2}
                  cy={COVER_PITCH / 2}
                  r={COVER_DOT * Math.sqrt(tone(coverProfile, k))}
                  fill="#000"
                />
              </Pattern>
            ))}
          </Defs>
          <AnimatedPath animatedProps={cover0} fill={`url(#${id}c0)`} />
          <AnimatedPath animatedProps={cover1} fill={`url(#${id}c1)`} />
          <AnimatedPath animatedProps={cover2} fill={`url(#${id}c2)`} />
        </Svg>
      </Animated.View>
    </View>
  );
}
