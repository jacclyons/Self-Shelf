import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './theme';

export const liquidGlass = isLiquidGlassAvailable();

interface GlassSurfaceProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** `clear` is the thin, highly translucent variant; `regular` is frostier. */
  variant?: 'regular' | 'clear';
  tintColor?: string;
  interactive?: boolean;
  /** Matches the container radius so the fallback blur clips identically. */
  radius?: number;
  /**
   * Forces the glass to light or dark regardless of the system appearance.
   * The reader sets its own theme, so its chrome can't follow the OS.
   */
  colorScheme?: 'light' | 'dark';
}

/**
 * One surface primitive for the whole app: real iOS 26 Liquid Glass where it
 * exists, an equivalent blur elsewhere, so nothing has to branch at call sites.
 */
export function GlassSurface({
  children,
  style,
  variant = 'regular',
  tintColor,
  interactive,
  radius = 0,
  colorScheme,
}: GlassSurfaceProps) {
  const theme = useTheme();
  const dark = colorScheme ? colorScheme === 'dark' : theme.scheme === 'dark';

  if (liquidGlass) {
    return (
      <GlassView
        style={[{ borderRadius: radius, overflow: 'hidden' }, style]}
        glassEffectStyle={variant}
        tintColor={tintColor}
        isInteractive={interactive}
        colorScheme={colorScheme ?? 'auto'}
      >
        {children}
      </GlassView>
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
        <BlurView
          intensity={variant === 'clear' ? 40 : 72}
          tint={dark ? 'systemThickMaterialDark' : 'systemThickMaterialLight'}
          style={StyleSheet.absoluteFill}
        />
        {tintColor ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: tintColor }]} />
        ) : null}
        {children}
      </View>
    );
  }

  return (
    <View
      style={[
        {
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: tintColor ?? (dark ? 'rgba(30,28,34,0.5)' : 'rgba(255,255,255,0.5)'),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
