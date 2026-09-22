import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import type { SymbolViewProps } from 'expo-symbols';
import { Text, View } from 'react-native';

import { Icon } from '@/ui/Bits';
import { GlassSurface } from '@/ui/Glass';
import { Press } from '@/ui/Press';
import { radius, tabBarInset, type as type_, useTheme } from '@/ui/theme';

/**
 * Browser twin of `_layout.tsx`.
 *
 * `NativeTabs` on web is a text-only pill that ignores the SF Symbol and
 * Material icons, and the native layout hides the labels, so the bar came out
 * as an empty capsule. The JS tab navigator lets the browser draw its own bar
 * instead: a floating glass pill along the top of the window, built from the
 * same drawn icons and tint fills as the rest of the chrome. `tabBarInset` in
 * the theme is how much room the screens leave for it.
 */

/** Which drawn glyph each tab shows; the filled variant marks the current one. */
const TABS: Record<
  string,
  {
    label: string;
    icon: SymbolViewProps['name'];
    selected: SymbolViewProps['name'];
  }
> = {
  index: { label: 'Reading Now', icon: 'book.closed', selected: 'book.fill' },
  library: {
    label: 'Library',
    icon: 'books.vertical',
    selected: 'books.vertical.fill',
  },
  search: {
    label: 'Search',
    icon: 'magnifyingglass',
    selected: 'magnifyingglass',
  },
};

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: TABS.index.label }} />
      <Tabs.Screen name="library" options={{ title: TABS.library.label }} />
      <Tabs.Screen name="search" options={{ title: TABS.search.label }} />
    </Tabs>
  );
}

function TabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();

  return (
    // Absolute rather than in the flow, so the screens run underneath it and
    // scroll up behind the glass, as they do under the iOS bar.
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: tabBarInset,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <GlassSurface
        radius={radius.pill}
        style={{
          flexDirection: 'row',
          padding: 4,
          borderRadius: radius.pill,
          // Glass over a plain background reads as a smudge; a hairline gives it an edge.
          borderWidth: 1,
          borderColor: theme.separator,
          shadowColor: theme.shadow,
          shadowOpacity: theme.scheme === 'dark' ? 0.4 : 0.1,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        <View role="tablist" style={{ flexDirection: 'row' }}>
          {state.routes.map((route, index) => {
            const tab = TABS[route.name];
            if (!tab) return null;
            const selected = state.index === index;

            const onPress = () => {
              // The same two-step as react-navigation's own bar: screens can
              // listen for tabPress (search focuses its field) and cancel it.
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!selected && !event.defaultPrevented) navigation.navigate(route.name);
            };

            return (
              <Press
                key={route.key}
                haptic={false}
                scaleTo={0.94}
                role="tab"
                aria-label={tab.label}
                aria-selected={selected}
                onPress={onPress}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                    height: 40,
                    paddingLeft: 14,
                    paddingRight: 16,
                    borderRadius: radius.pill,
                    backgroundColor: selected ? theme.tint : 'transparent',
                  }}
                >
                  <Icon
                    name={selected ? tab.selected : tab.icon}
                    size={17}
                    color={selected ? theme.onTint : theme.textSecondary}
                  />
                  <Text
                    style={[
                      type_.subhead,
                      {
                        fontWeight: '600',
                        color: selected ? theme.onTint : theme.textSecondary,
                      },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </View>
              </Press>
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
}
