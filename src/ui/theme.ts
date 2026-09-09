import { useColorScheme } from 'react-native';

/**
 * JellyShelf accents with its own green→teal gradient and keeps everything else
 * warm and papery so covers stay the loudest thing on screen. Jellyfin's purple
 * is kept in `brand` for moments that are explicitly about the server itself.
 */
export const brand = {
  purple: '#AA5CC3',
  blue: '#00A4DC',
} as const;

/**
 * JellyShelf's own brand gradient. Use these where the app is speaking as itself
 * (the walkthrough, the mark); `brand` stays reserved for Jellyfin-flavoured
 * moments like the server connection flow.
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
  separator: 'rgba(255,255,255,0.10)',
  hairline: 'rgba(255,255,255,0.16)',
  shadow: '#000000',
  glassTint: 'rgba(30,28,34,0.5)',
  overlay: 'rgba(0,0,0,0.5)',
  destructive: '#FF6B6B',
  success: '#4BD08B',
};

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
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
