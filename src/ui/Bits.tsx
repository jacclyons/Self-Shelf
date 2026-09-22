import type { SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Press } from './Press';
import { radius, serif, type as type_, useTheme } from './theme';

import { Icon } from './Icon';

export { Icon };

/* ------------------------------ discord mark ------------------------------ */

/**
 * Discord's own mark, drawn rather than pulled from SF Symbols so it reads as
 * the service it links to. It takes a single colour, so it sits in a settings
 * row beside the SF Symbols without standing out from them.
 */
export function DiscordMark({ size = 20, color }: { size?: number; color?: string }) {
  const theme = useTheme();

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          fill={color ?? theme.text}
          d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"
        />
      </Svg>
    </View>
  );
}

/* ------------------------------ progress ring ----------------------------- */

export function ProgressRing({
  percent,
  size = 34,
  stroke = 3,
  color,
  track,
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, percent));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={track ?? theme.separator}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? theme.tint}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * clamped} ${circumference}`}
          fill="none"
        />
      </Svg>
      {children ? <View style={StyleSheet.absoluteFill} pointerEvents="none">{children}</View> : null}
    </View>
  );
}

export function ProgressBar({
  percent,
  height = 3,
  color,
  style,
}: {
  percent: number;
  height?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        { height, borderRadius: height, backgroundColor: theme.separator, overflow: 'hidden' },
        style,
      ]}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(1, percent)) * 100}%`,
          height: '100%',
          borderRadius: height,
          backgroundColor: color ?? theme.tint,
        }}
      />
    </View>
  );
}

/* ------------------------------- section head ----------------------------- */

export function SectionHeader({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          marginBottom: 12,
        },
        style,
      ]}
    >
      {/*
        Ovo has no bold cut and iOS won't synthesise one, so the weight is
        faked: a hard-edged shadow in the text's own colour, nudged a hair
        sideways, fattens every stroke. Web gets a real faux-bold from the
        browser, so it doesn't need the shadow.
      */}
      <Text
        style={[
          type_.title2,
          { fontFamily: serif, color: theme.text, letterSpacing: -0.1 },
          Platform.OS === 'web'
            ? null
            : { textShadowColor: theme.text, textShadowOffset: { width: 0.6, height: 0 }, textShadowRadius: 0 },
        ]}
      >
        {title}
      </Text>
      {action ? (
        <Press haptic="selection" onPress={onAction} scaleTo={0.94} hitSlop={10}>
          <Text style={[type_.subhead, { color: theme.tint, fontWeight: '600' }]}>{action}</Text>
        </Press>
      ) : null}
    </View>
  );
}

/* ---------------------------------- chip ---------------------------------- */

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: SymbolViewProps['name'];
}) {
  const theme = useTheme();
  return (
    <Press haptic="selection" onPress={onPress} scaleTo={0.94}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: radius.pill,
          backgroundColor: selected ? theme.tint : theme.surfaceAlt,
        }}
      >
        {icon ? <Icon name={icon} size={13} color={selected ? theme.onTint : theme.textSecondary} /> : null}
        <Text
          style={[
            type_.footnote,
            { fontWeight: '600', color: selected ? theme.onTint : theme.textSecondary },
          ]}
        >
          {label}
        </Text>
      </View>
    </Press>
  );
}

/* ------------------------------- empty state ------------------------------ */

export function EmptyState({
  icon = 'books.vertical',
  title,
  message,
  action,
  onAction,
}: {
  icon?: SymbolViewProps['name'];
  title: string;
  message?: string;
  action?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 44, paddingVertical: 56, gap: 10 }}>
      <Icon name={icon} size={44} color={theme.textTertiary} weight="regular" />
      <Text style={[type_.headline, { color: theme.text, marginTop: 6, textAlign: 'center' }]}>
        {title}
      </Text>
      {message ? (
        <Text style={[type_.subhead, { color: theme.textSecondary, textAlign: 'center' }]}>
          {message}
        </Text>
      ) : null}
      {action ? (
        <Press onPress={onAction} style={{ marginTop: 10 }}>
          <View
            style={{
              paddingHorizontal: 18,
              paddingVertical: 10,
              borderRadius: radius.pill,
              backgroundColor: theme.tintSoft,
            }}
          >
            <Text style={[type_.subhead, { color: theme.tint, fontWeight: '600' }]}>{action}</Text>
          </View>
        </Press>
      ) : null}
    </View>
  );
}
