import type { Accent } from '@/ui/accents';
import { kvGet, kvSet } from './db';

export interface ReaderTheme {
  id: string;
  name: string;
  bg: string;
  fg: string;
  /** The brand accent; `themeFor` swaps in the app's chosen accent unless `ownAccent`. */
  accent: string;
  /** Keeps `accent` whatever the app's accent is, for a theme whose palette depends on it. */
  ownAccent?: boolean;
  /** Inverts PDF page raster so scanned pages match a dark room. */
  dimPages?: boolean;
  /** Thickens body copy for low-vision reading, the way Books' Bold theme does. */
  bold?: boolean;
  dark: boolean;
}

export const READER_THEMES: ReaderTheme[] = [
  { id: 'original', name: 'Original', bg: '#FFFFFF', fg: '#16130F', accent: '#2C8A8D', dark: false },
  { id: 'paper', name: 'Paper', bg: '#F7F3EC', fg: '#181513', accent: '#2C8A8D', dark: false },
  { id: 'sepia', name: 'Sepia', bg: '#F2E3C8', fg: '#3B2E1E', accent: '#8A5A25', ownAccent: true, dark: false },
  { id: 'bold', name: 'Bold', bg: '#FFFFFF', fg: '#000000', accent: '#2C8A8D', bold: true, dark: false },
  { id: 'quiet', name: 'Quiet', bg: '#2F2F35', fg: '#D9D6D1', accent: '#7FCA83', dimPages: true, dark: true },
  { id: 'night', name: 'Night', bg: '#0A0A0B', fg: '#C8C5C0', accent: '#7FCA83', dimPages: true, dark: true },
];

export interface ReaderFont {
  id: string;
  name: string;
  /** CSS stack handed to the reader engine. */
  stack: string;
  /**
   * iOS family name used to render this option's own label in its own face.
   * React Native needs a single family, not the CSS stack. Undefined means the
   * system font (San Francisco).
   */
  preview?: string;
}

/** Only faces that actually ship with iOS — no downloads, no fallback surprises. */
export const READER_FONTS: ReaderFont[] = [
  { id: 'publisher', name: 'Publisher', stack: 'publisher' },
  { id: 'newyork', name: 'New York', stack: 'ui-serif, "New York", Georgia, serif', preview: 'New York' },
  { id: 'athelas', name: 'Athelas', stack: 'Athelas, Georgia, serif', preview: 'Athelas' },
  { id: 'charter', name: 'Charter', stack: 'Charter, Georgia, serif', preview: 'Charter' },
  { id: 'georgia', name: 'Georgia', stack: 'Georgia, serif', preview: 'Georgia' },
  { id: 'iowan', name: 'Iowan', stack: '"Iowan Old Style", Georgia, serif', preview: 'Iowan Old Style' },
  {
    id: 'palatino',
    name: 'Palatino',
    stack: 'Palatino, "Palatino Linotype", Georgia, serif',
    preview: 'Palatino',
  },
  {
    id: 'times',
    name: 'Times New Roman',
    stack: '"Times New Roman", Times, serif',
    preview: 'Times New Roman',
  },
  { id: 'seravek', name: 'Seravek', stack: 'Seravek, -apple-system, sans-serif', preview: 'Seravek' },
  { id: 'system', name: 'San Francisco', stack: '-apple-system, system-ui, sans-serif' },
  { id: 'avenir', name: 'Avenir', stack: '"Avenir Next", Avenir, sans-serif', preview: 'Avenir Next' },
];

export interface ReaderSettings {
  themeId: string;
  fontId: string;
  /** Percentage passed to epub.js — 100 is the publisher's own size. */
  fontSize: number;
  lineHeight: number;
  margin: number;
  justify: boolean;
  flow: 'paged' | 'scrolled';
  /** Manga reads right-to-left; comics only. */
  rtl: boolean;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  themeId: 'original',
  fontId: 'publisher',
  fontSize: 110,
  lineHeight: 1.6,
  margin: 26,
  justify: false,
  flow: 'paged',
  rtl: false,
};

const KEY = 'reader.settings.v1';

export function loadSettings(): ReaderSettings {
  const stored = { ...DEFAULT_SETTINGS, ...kvGet<Partial<ReaderSettings>>(KEY, {}) };
  // A previously-chosen font may have been retired (Georgia isn't on iOS).
  if (!READER_FONTS.some((f) => f.id === stored.fontId)) stored.fontId = DEFAULT_SETTINGS.fontId;
  if (!READER_THEMES.some((t) => t.id === stored.themeId)) stored.themeId = DEFAULT_SETTINGS.themeId;
  return stored;
}

export function saveSettings(settings: ReaderSettings) {
  kvSet(KEY, settings);
}

/** The chosen theme, with the app's accent (light or dark shade to suit the page). */
export function themeFor(settings: ReaderSettings, accent: Accent): ReaderTheme {
  const theme = READER_THEMES.find((t) => t.id === settings.themeId) ?? READER_THEMES[0];
  if (theme.ownAccent) return theme;
  return { ...theme, accent: theme.dark ? accent.dark : accent.light };
}

export function fontFor(settings: ReaderSettings): ReaderFont {
  return READER_FONTS.find((f) => f.id === settings.fontId) ?? READER_FONTS[0];
}

export const FONT_SIZE_RANGE = { min: 70, max: 240, step: 10 };

/** epub.js location maps are expensive to build; cache them per book. */
export function cachedLocations(itemId: string): string | undefined {
  return kvGet<string | undefined>(`locations.${itemId}`, undefined);
}

export function cacheLocations(itemId: string, data: string) {
  kvSet(`locations.${itemId}`, data);
}
