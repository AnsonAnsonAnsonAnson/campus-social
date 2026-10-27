import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

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

/**
 * The bottom tab bar from the design: five line icons with labels, cobalt for
 * the current tab, translucent white with a hairline on top.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
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
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const color = focused ? c.tint : palette.neutral[450];
        const label = typeof options.title === 'string' ? options.title : route.name;
        const badge = options.tabBarBadge;
        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            tap();
            navigateToTab(route.key);
          }
        };
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            style={styles.item}>
            <View>
              <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
                <Path
                  d={ICONS[route.name] ?? ICONS.discover}
                  stroke={color}
                  strokeWidth={focused ? 2.2 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
              {badge != null && <View style={[styles.dot, { backgroundColor: c.danger, borderColor: c.tabBar }]} />}
            </View>
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
  dot: { position: 'absolute', top: 0, right: -3, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
});
