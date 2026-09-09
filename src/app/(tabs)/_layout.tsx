import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/ui/theme';

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <NativeTabs
      tintColor={theme.tint}
      // iOS 26 tucks the tab bar away as you read down a shelf.
      minimizeBehavior="onScrollDown"
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'book', selected: 'book.fill' }}
          md="menu_book"
        />
        <NativeTabs.Trigger.Label>Reading Now</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }}
          md="library_books"
        />
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
