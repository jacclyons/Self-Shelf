import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { useTheme } from '@/ui/theme';

export default function TabsLayout() {
  const theme = useTheme();

  // On web the tab bar is an HTML pill whose stylesheet is always dark, so it
  // is handed the palette here. iOS draws its own Liquid Glass bar, which
  // already follows the appearance; colouring it would lose the glass.
  const webColors =
    Platform.OS === 'web'
      ? {
          backgroundColor: theme.bgElevated,
          indicatorColor: theme.tintSoft,
          labelStyle: { color: theme.textSecondary },
        }
      : {};

  return (
    <NativeTabs
      tintColor={theme.tint}
      {...webColors}
      // iOS 26 tucks the tab bar away as you read down a shelf.
      minimizeBehavior="onScrollDown"
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'book', selected: 'book.fill' }}
          md="menu_book"
        />
        {/* Icons only: the labels stay for accessibility but are not drawn. */}
        <NativeTabs.Trigger.Label hidden>Reading Now</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }}
          md="library_books"
        />
        <NativeTabs.Trigger.Label hidden>Library</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        <NativeTabs.Trigger.Label hidden>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
