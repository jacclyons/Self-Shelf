/**
 * The accent colours offered in Settings. The accent is the app's one
 * interactive colour: the selected tab, links, progress bars, selected
 * controls. The brand gradient is separate and never changes (see `shelf` in
 * `theme.ts`).
 *
 * Each accent has a deeper shade for light mode and a brighter one for dark,
 * so it reads as text against either background. The set sticks to warm,
 * papery colours that sit alongside book covers, and deliberately leaves out
 * purple and sky blue, which are Jellyfin's colours.
 *
 * This file imports nothing, so `state/appearance` can use it without a cycle
 * through `theme.ts`.
 */
export interface Accent {
  id: string;
  name: string;
  light: string;
  dark: string;
}

export const ACCENTS: Accent[] = [
  // The brand pair, `shelf.teal` and `shelf.green`. Stays first: it's the default.
  { id: 'shelf', name: 'Self-Shelf', light: '#2C8A8D', dark: '#7FCA83' },
  { id: 'terracotta', name: 'Terracotta', light: '#B5563A', dark: '#E08A6B' },
  { id: 'ochre', name: 'Ochre', light: '#9A6B0F', dark: '#E0B45A' },
  { id: 'rose', name: 'Rose', light: '#B4486A', dark: '#EC8FAA' },
  { id: 'ink', name: 'Ink Blue', light: '#2F5D8C', dark: '#8DB0DB' },
  { id: 'graphite', name: 'Graphite', light: '#4A4641', dark: '#C8C2BA' },
];

export const DEFAULT_ACCENT = ACCENTS[0];

/** The id stored when the accent is a colour the user picked themselves. */
export const CUSTOM_ACCENT_ID = 'custom';

/**
 * Resolves a stored id, using `custom` for the picked colour. Falls back to the
 * default for an unknown id (e.g. one stored by a later build) or a missing colour.
 */
export function accentById(id: string | undefined, custom: string | null): Accent {
  if (id === CUSTOM_ACCENT_ID) return custom && isHex(custom) ? customAccent(custom) : DEFAULT_ACCENT;
  return ACCENTS.find((a) => a.id === id) ?? DEFAULT_ACCENT;
}

export function isHex(value: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(value);
}

// ------------------------------------------------------------ custom accents

/**
 * The backgrounds a custom accent has to read against: `bg` in the light and
 * dark palettes in `theme.ts`, repeated here to keep this file import-free.
 */
const PAPER = '#F7F3EC';
const INK = '#2C2C2C';

/** Links and selected controls should clear the 3:1 WCAG asks of UI parts. */
const MIN_CONTRAST = 3;

/**
 * Turns one picked colour into a light and a dark shade. A pale yellow can't
 * be a link on paper, nor a deep navy on black, so each shade is darkened or
 * lightened just far enough to stay readable. A colour that already reads is
 * used exactly as picked.
 */
export function customAccent(hex: string): Accent {
  return {
    id: CUSTOM_ACCENT_ID,
    name: 'Custom',
    light: readableOn(hex, PAPER, -1),
    dark: readableOn(hex, INK, 1),
  };
}

/**
 * White, unless white would be hard to read on `hex` (below 3:1), then near-black.
 * White comes first so deep accents keep the look the presets were drawn with.
 */
export function textOn(hex: string): string {
  return contrast(hexToRgb(hex), [255, 255, 255]) >= MIN_CONTRAST ? '#FFFFFF' : INK;
}

type RGB = [number, number, number];

/** Steps the lightness in `direction`, keeping hue and saturation, until it contrasts with `bg`. */
function readableOn(hex: string, bg: string, direction: 1 | -1): string {
  const ground = hexToRgb(bg);
  const [h, s, start] = rgbToHsl(hexToRgb(hex));
  let rgb = hexToRgb(hex);
  const canStep = (l: number) => (direction < 0 ? l > 0 : l < 1);
  for (let l = start; contrast(rgb, ground) < MIN_CONTRAST && canStep(l); ) {
    l = Math.min(1, Math.max(0, l + direction * 0.02));
    rgb = hslToRgb(h, s, l);
  }
  return rgbToHex(rgb);
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb: RGB): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** WCAG relative luminance. */
function luminance([r, g, b]: RGB): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}
