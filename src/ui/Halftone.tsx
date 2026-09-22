/**
 * Halftone shading: a screen of dots whose size follows a tone profile across
 * the width, the way a printed shadow is built from bigger dots rather than a
 * darker ink. An SVG pattern can't vary its dots within one fill, so the
 * width is cut into vertical strips, each with a grid of one radius; the
 * strips sit in one SVG and share its user space, so the grid runs unbroken
 * across the joins. It's drawn once and never animates itself: fade the whole
 * thing in and out with the opacity of a parent view.
 */

import { useId, useMemo } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';

interface HalftoneShadeProps {
  width: number;
  height: number;
  /** Tone across the width, 0 (clear) to 1 (heaviest), sampled at each strip's centre. */
  profile: (x: number) => number;
  color: string;
  strips?: number;
  /** Centre-to-centre spacing of the dots. */
  pitch?: number;
  /** Dot radius at full tone; below that, radius follows the square root, so tone tracks dot area. */
  maxRadius?: number;
  /** Grid angle on screen. Printed shading is conventionally screened at 45°. */
  angle?: number;
  style?: StyleProp<ViewStyle>;
}

/** A static cast shadow, with smaller dots rather than blur at its edges. */
export function HalftoneShadow({
  width,
  height,
  color,
  opacity = 0.24,
  radius = 7,
}: {
  width: number;
  height: number;
  color: string;
  opacity?: number;
  radius?: number;
}) {
  const spread = 18;
  const offset = 8;
  const pitch = 4;
  const dots = useMemo(() => {
    const result: { x: number; y: number; r: number }[] = [];
    for (let row = 0; row * pitch < height + spread * 2 + offset; row++) {
      const y = row * pitch - spread;
      for (let col = 0; col * pitch < width + spread * 2; col++) {
        const x = col * pitch + (row % 2) * pitch / 2 - spread;
        const dx = Math.abs(x - width / 2) - (width / 2 - radius);
        const surfaceDy = Math.abs(y - height / 2) - (height / 2 - radius);
        const surfaceDistance = Math.hypot(Math.max(0, dx), Math.max(0, surfaceDy))
          + Math.min(Math.max(dx, surfaceDy), 0) - radius;
        // Leave the surface clear even when it is translucent glass.
        if (surfaceDistance < 1.4) continue;
        const dy = Math.abs(y - height / 2 - offset) - (height / 2 - radius);
        const distance = Math.max(0, Math.hypot(Math.max(0, dx), Math.max(0, dy)) - radius);
        const fade = Math.max(0, 1 - distance / spread);
        if (fade > 0.08) result.push({ x: x + spread, y: y + spread, r: 1.4 * fade });
      }
    }
    return result;
  }, [height, radius, width]);

  return (
    <Svg
      width={width + spread * 2}
      height={height + spread * 2 + offset}
      pointerEvents="none"
      style={{ position: 'absolute', left: -spread, top: -spread, opacity }}
    >
      {dots.map((dot, i) => (
        <Circle key={i} cx={dot.x} cy={dot.y} r={dot.r} fill={color} />
      ))}
    </Svg>
  );
}

/** A dot in a halftone screen, in the SVG's user space. */
export interface HalftoneDot {
  x: number;
  y: number;
  r: number;
}

/**
 * The dots of a cast shadow behind any simple polygon: the same screen as
 * `HalftoneShadow`, for shapes that aren't rounded rectangles. Dots under the
 * surface itself are left out, and the rest shrink with distance from the
 * shadow's edge. Coordinates come back in the polygon's own space, so the
 * caller draws them into its own SVG, behind the shape.
 */
export function polygonShadowDots(
  points: [number, number][],
  {
    spread = 18,
    offsetX = 0,
    offsetY = 8,
    pitch = 4,
    maxRadius = 1.4,
  }: { spread?: number; offsetX?: number; offsetY?: number; pitch?: number; maxRadius?: number } = {},
): HalftoneDot[] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs) - spread + Math.min(0, offsetX);
  const maxX = Math.max(...xs) + spread + Math.max(0, offsetX);
  const minY = Math.min(...ys) - spread + Math.min(0, offsetY);
  const maxY = Math.max(...ys) + spread + Math.max(0, offsetY);
  const shadow = points.map(([x, y]): [number, number] => [x + offsetX, y + offsetY]);

  const result: HalftoneDot[] = [];
  for (let row = 0; minY + row * pitch <= maxY; row++) {
    const y = minY + row * pitch;
    for (let col = 0; minX + col * pitch <= maxX; col++) {
      const x = minX + col * pitch + (row % 2) * (pitch / 2);
      // Leave the surface clear: the dots only ever show past its edge.
      if (signedDistance(x, y, points) < 1.4) continue;
      const distance = Math.max(0, signedDistance(x, y, shadow));
      const fade = Math.max(0, 1 - distance / spread);
      if (fade > 0.08) result.push({ x, y, r: maxRadius * fade });
    }
  }
  return result;
}

/** Distance from a point to a polygon's edge, negative inside. */
function signedDistance(px: number, py: number, poly: [number, number][]): number {
  let nearest = Infinity;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    // Distance to the segment a→b.
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    nearest = Math.min(nearest, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
    // Ray cast for containment.
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside ? -nearest : nearest;
}

export function HalftoneShade({
  width,
  height,
  profile,
  color,
  strips = 8,
  pitch = 5,
  maxRadius = 1.9,
  angle = 45,
  style,
}: HalftoneShadeProps) {
  // Pattern ids are document-global in SVG, and there are many books on a shelf.
  const prefix = `ht${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const stripWidth = width / strips;

  return (
    <Svg width={width} height={height} style={style} pointerEvents="none">
      <Defs>
        {Array.from({ length: strips }, (_, i) => {
          const tone = Math.min(1, Math.max(0, profile((i + 0.5) / strips)));
          return (
            <Pattern
              key={i}
              id={`${prefix}-${i}`}
              patternUnits="userSpaceOnUse"
              width={pitch}
              height={pitch}
              patternTransform={`rotate(${angle})`}
            >
              <Circle cx={pitch / 2} cy={pitch / 2} r={maxRadius * Math.sqrt(tone)} fill={color} />
            </Pattern>
          );
        })}
      </Defs>
      {Array.from({ length: strips }, (_, i) => (
        <Rect
          key={i}
          x={i * stripWidth}
          y={0}
          // A hair of overlap so a rounding gap never shows between strips.
          width={stripWidth + 1}
          height={height}
          fill={`url(#${prefix}-${i})`}
        />
      ))}
    </Svg>
  );
}
