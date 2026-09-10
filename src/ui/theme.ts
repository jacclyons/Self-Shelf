import { useMemo } from 'react';
import { Platform, type ViewStyle } from 'react-native';

import { useResolvedAccent, useResolvedScheme } from '@/state/appearance';

import { DEFAULT_ACCENT, textOn, type Accent } from './accents';

/**
 * Self-Shelf accents with its own green→teal gradient and keeps everything else
 * warm and papery so covers stay the loudest thing on screen. Use these where
 * the app is speaking as itself (the walkthrough, the mark). They don't follow
 * the accent setting; `theme.tint` does.
 */
export const shelf = {
  green: '#7FCA83',
  teal: '#2C8A8D',
} as const;

export interface Palette {
  scheme: 'light' | 'dark';
  bg: string;
  bgElevated: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  tint: string;
  tintSoft: string;
  /** Text and icons drawn on a `tint` fill. */
  onTint: string;
  separator: string;
  hairline: string;
  shadow: string;
  glassTint: string;
  overlay: string;
  destructive: string;
  success: string;
}

const light: Palette = {
  scheme: 'light',
  bg: '#F7F3EC',
  bgElevated: '#FFFFFF',
  surface: 'rgba(255,255,255,0.72)',
  surfaceAlt: 'rgba(28,22,16,0.045)',
  text: '#181513',
  textSecondary: 'rgba(24,21,19,0.58)',
  textTertiary: 'rgba(24,21,19,0.36)',
  tint: '#2C8A8D',
  tintSoft: 'rgba(44,138,141,0.14)',
  onTint: '#FFFFFF',
  separator: 'rgba(24,21,19,0.09)',
  hairline: 'rgba(24,21,19,0.14)',
  shadow: '#2A1D14',
  glassTint: 'rgba(255,255,255,0.5)',
  overlay: 'rgba(20,16,12,0.32)',
  destructive: '#D6353B',
  success: '#25A05B',
};

const dark: Palette = {
  scheme: 'dark',
  bg: '#0C0B0E',
  bgElevated: '#161519',
  surface: 'rgba(255,255,255,0.08)',
  surfaceAlt: 'rgba(255,255,255,0.06)',
  text: '#F4F1EC',
  textSecondary: 'rgba(244,241,236,0.62)',
  textTertiary: 'rgba(244,241,236,0.38)',
  tint: '#7FCA83',
  tintSoft: 'rgba(127,202,131,0.18)',
  // The green is too light for white text; `textOn` in accents.ts agrees.
  onTint: '#0C0B0E',
  separator: 'rgba(255,255,255,0.10)',
  hairline: 'rgba(255,255,255,0.16)',
  shadow: '#000000',
  glassTint: 'rgba(30,28,34,0.5)',
  overlay: 'rgba(0,0,0,0.5)',
  destructive: '#FF6B6B',
  success: '#4BD08B',
};

/**
 * The active palette, honouring the Appearance setting rather than only the OS,
 * with `tint`, `tintSoft` and `onTint` swapped for the chosen accent.
 */
export function useTheme(): Palette {
  const scheme = useResolvedScheme();
  const accent = useResolvedAccent();
  return useMemo(() => paletteFor(scheme, accent), [scheme, accent]);
}

function paletteFor(scheme: 'light' | 'dark', accent: Accent): Palette {
  const base = scheme === 'dark' ? dark : light;
  // The default accent is already baked into the palettes, as is its soft shade.
  if (accent === DEFAULT_ACCENT) return base;
  const tint = accent[scheme];
  return {
    ...base,
    tint,
    tintSoft: withAlpha(tint, scheme === 'dark' ? 0.18 : 0.14),
    onTint: textOn(tint),
  };
}

/** `#RRGGBB` plus an opacity, as an `rgba()` string. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export const palettes = { light, dark };

/** iOS system type scale, tuned a touch tighter for a bookish feel. */
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '500' },
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const spacing = (n: number) => n * 4;

/**
 * A browser window is far wider than a phone, and stretching a 54pt button
 * across 2000px looks like a bug. Content sits in a centred column there;
 * on device this is an empty style and changes nothing.
 */
export const maxContentWidth = Platform.OS === 'web' ? 900 : Infinity;

export const contentColumn: ViewStyle =
  Platform.OS === 'web'
    ? { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' }
    : {};

/** The same, narrowed for prose and forms that read badly at full width. */
export const readingColumn: ViewStyle =
  Platform.OS === 'web' ? { width: '100%', maxWidth: 560, alignSelf: 'center' } : {};

/**
 * The reader's column on web, matched to the width the engine itself is given
 * so the chrome lines up with the text rather than the window.
 */
export const maxReaderWidth = 980;

export const readerColumn: ViewStyle =
  Platform.OS === 'web'
    ? { width: '100%', maxWidth: maxReaderWidth, alignSelf: 'center' }
    : {};

/**
 * The tab bar is along the bottom on device but across the top of the window on
 * web, where it floats over the content. Screens under it add this much room so
 * their headers are not sitting behind the tabs.
 */
export const tabBarInset = Platform.OS === 'web' ? 64 : 0;
