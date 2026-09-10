import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './theme';

/**
 * SF Symbols, which only exist on iOS. Android gets a neutral dot; the browser
 * has its own drawn set in `Icon.web.tsx`.
 */
export function Icon({
  name,
  size = 20,
  color,
  weight = 'semibold',
  style,
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color?: string;
  weight?: SymbolViewProps['weight'];
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const tint = color ?? theme.text;

  if (Platform.OS !== 'ios') {
    // Android has no SF Symbols; a neutral dot keeps layout stable.
    return (
      <View
        style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
      >
        <View
          style={{
            width: size * 0.6,
            height: size * 0.6,
            borderRadius: size,
            backgroundColor: tint,
          }}
        />
      </View>
    );
  }

  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={tint}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={[{ width: size, height: size }, style]}
    />
  );
}
