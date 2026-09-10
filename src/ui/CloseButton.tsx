import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './Bits';
import { Press } from './Press';
import { contentColumn, radius, useTheme } from './theme';

/**
 * A way out of a screen presented as a modal.
 *
 * On device these are sheets: the system grabber and the swipe-down gesture
 * dismiss them, so this renders nothing. A browser has neither — a modal route
 * is just a page, and one opened straight from its URL has no history behind it
 * either — so on web the screen has to offer its own exit.
 *
 * `column` should match the screen's content width so the button sits at the
 * edge of the content rather than the edge of the window.
 */
export function CloseButton({
  onPress,
  column = contentColumn,
  placement = 'overlay',
}: {
  onPress: () => void;
  column?: StyleProp<ViewStyle>;
  /**
   * `overlay` floats the button above the screen, for pages that open on
   * artwork. `inline` puts it in the layout, so a heading underneath is not
   * pushed out from behind it.
   */
  placement?: 'overlay' | 'inline';
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  if (Platform.OS !== 'web') return null;

  const button = (
    <Press onPress={onPress} haptic={false} hitSlop={10}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.surfaceAlt,
        }}
      >
        <Icon name="xmark" size={15} color={theme.textSecondary} weight="semibold" />
      </View>
    </Press>
  );

  if (placement === 'inline') {
    // Already inside the screen's own padded column, so it only needs to make
    // room for whatever follows it.
    return <View style={{ alignItems: 'flex-start', marginBottom: 16 }}>{button}</View>;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 14, left: 0, right: 0, zIndex: 10 }}
    >
      <View
        pointerEvents="box-none"
        style={[column, { paddingHorizontal: 18, alignItems: 'flex-start' }]}
      >
        {button}
      </View>
    </View>
  );
}
