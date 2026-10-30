import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { t } from '@/lib/i18n';
import { palette, useColors } from '@/lib/theme';

import { tap } from './ui';

/** Line icons from the design file, drawn on a 24pt grid. */
const ICONS: Record<string, string> = {
  discover: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  societies:
    'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5M16 11a3 3 0 1 0 0-6M21.5 20c0-2.8-2-5.1-4.5-5.4',
  tickets: 'M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4zM14 6v12',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
};

const TABS = ['discover', 'calendar', 'societies', 'tickets', 'profile'] as const;
export type TabName = (typeof TABS)[number];

const tabTitle = (name: string) =>
  ({ discover: t('Discover'), calendar: t('Calendar'), societies: t('Societies'), tickets: t('Tickets'), profile: t('Profile') })[name] ??
  name;

type Item = { key: string; name: string; label: string; focused: boolean; badge?: boolean; onPress: () => void; onLongPress?: () => void };

/**
 * The bottom tab bar from the design: five line icons with labels, the brand
 * colour and a solid brand pill for the current tab, translucent white with a hairline on top.
 */
function TabBarView({ items }: { items: Item[] }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          backgroundColor: c.tabBar,
          borderTopColor: c.border,
          paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 10 : 6),
        },
      ]}>
      {items.map((item) => {
        const color = item.focused ? c.tintText : palette.neutral[500];
        return (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            onLongPress={item.onLongPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: item.focused }}
            accessibilityLabel={item.label}
            style={styles.item}>
            <View style={[styles.pill, item.focused && { backgroundColor: c.brand }]}>
              <Svg width={25} height={25} viewBox="0 0 24 24" fill="none">
                <Path
                  d={ICONS[item.name] ?? ICONS.discover}
                  stroke={item.focused ? c.onBrand : color}
                  strokeWidth={item.focused ? 2.2 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
              {item.badge && <View style={[styles.dot, { backgroundColor: c.danger, borderColor: c.tabBar }]} />}
            </View>
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The tab navigator's bar. */
export function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  return (
    <TabBarView
      items={state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        return {
          key: route.key,
          name: route.name,
          label: typeof options.title === 'string' ? options.title : tabTitle(route.name),
          focused,
          badge: options.tabBarBadge != null,
          onPress: () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              tap();
              navigateToTab(route.key);
            }
          },
          onLongPress: () => emitter.emit({ type: 'tabLongPress', target: route.key }),
        };
      })}
    />
  );
}

/**
 * The same bar under screens pushed on top of the tabs (Search, a society page),
 * as the design shows it there. Tapping a tab goes back to the tabs.
 */
export function StackTabBar({ current }: { current: TabName }) {
  return (
    <TabBarView
      items={TABS.map((name) => ({
        key: name,
        name,
        label: tabTitle(name),
        focused: name === current,
        onPress: () => {
          tap();
          router.navigate(`/${name}`);
        },
      }))}
    />
  );
}
const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingTop: 7,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  item: { flex: 1, alignItems: 'center', gap: 3, minHeight: 44 },
  label: { fontSize: 10, fontWeight: '600' },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 1, right: 12, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
});
