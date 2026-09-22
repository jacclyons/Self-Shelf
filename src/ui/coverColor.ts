/**
 * Spine colours for the 3D shelf.
 *
 * A spine should look like it belongs to the cover it's attached to, but the
 * app never decodes cover art itself, so there's nothing to sample a real
 * dominant colour from. Jellyfin already sends a BlurHash for every cover, and
 * a BlurHash's first component *is* the average colour of the image, so
 * decoding four characters gets us close enough for a 30pt strip without
 * pulling in an image-processing dependency.
 *
 * Books with no hash — anything sideloaded into the Files folder, which
 * Jellyfin never saw — fall back to a hue derived from the id, so a shelf of
 * local books still looks like a shelf rather than a row of identical greys.
 */

import type { BaseItem } from '@/api/types';

type RGB = [number, number, number];

/** The BlurHash alphabet, in value order. */
const DIGITS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

function decode83(value: string): number {
  let result = 0;
  for (const char of value) {
    const index = DIGITS.indexOf(char);
    // A malformed hash is a server quirk, not something worth throwing over.
    if (index < 0) return -1;
    result = result * 83 + index;
  }
  return result;
}

/**
 * The average colour of a cover, from characters 2–5 of its BlurHash. Those
 * four carry the DC component, which the format stores as three plain sRGB
 * bytes, so no gamma work is needed to get back to a displayable colour.
 */
function averageOf(hash: string): RGB | null {
  if (hash.length < 6) return null;
  const dc = decode83(hash.slice(2, 6));
  if (dc < 0) return null;
  return [(dc >> 16) & 255, (dc >> 8) & 255, dc & 255];
}

function hashOf(item: BaseItem): string | undefined {
  const tag = item.ImageTags?.Primary;
  if (!tag) return undefined;
  return item.ImageBlurHashes?.Primary?.[tag];
}

/** A stable hue per book, so the same local file keeps the same spine. */
function hueFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 360) / 360;
}

/**
 * The colour to bind a book in. Cover averages tend to be washed out or nearly
 * black, and neither makes a spine you can tell apart from its neighbours, so
 * the hue is kept and the saturation and lightness are pulled into a range
 * that reads as cloth or leather. Dark mode gets a slightly lighter band so
 * spines don't disappear into the near-black background.
 */
export function spineColor(item: BaseItem, scheme: 'light' | 'dark'): string {
  const hash = hashOf(item);
  const average = hash ? averageOf(hash) : null;

  const [h, s, l] = average ? rgbToHsl(average) : [hueFromId(item.Id), 0.34, 0.42];

  const minLight = scheme === 'dark' ? 0.34 : 0.26;
  const maxLight = scheme === 'dark' ? 0.6 : 0.52;

  return rgbToHex(hslToRgb(h, clamp(s, 0.2, 0.62), clamp(l, minLight, maxLight)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
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
    max === rn
      ? (gn - bn) / d + (gn < bn ? 6 : 0)
      : max === gn
        ? (bn - rn) / d + 2
        : (rn - gn) / d + 4;
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
