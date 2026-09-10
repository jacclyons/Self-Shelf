import type { SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Press } from './Press';
import { radius, type as type_, useTheme } from './theme';

import { Icon } from './Icon';

export { Icon };

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
      <Text style={[type_.title2, { color: theme.text, letterSpacing: -0.4 }]}>{title}</Text>
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
        {icon ? <Icon name={icon} size={13} color={selected ? '#fff' : theme.textSecondary} /> : null}
        <Text
          style={[
            type_.footnote,
            { fontWeight: '600', color: selected ? '#fff' : theme.textSecondary },
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
