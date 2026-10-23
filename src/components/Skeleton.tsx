import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, ScrollView, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { radius, space, useColors } from '@/lib/theme';

/** Grey placeholder block that gently pulses while content loads. */
export function Skeleton({
  width = '100%',
  height = 14,
  round = radius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  round?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.55, duration: 650, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [pulse]);
  return <Animated.View style={[{ width, height, borderRadius: round, backgroundColor: c.fill, opacity: pulse }, style]} />;
}

export function EventRowSkeleton() {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space.md,
        marginHorizontal: space.lg,
        padding: space.md,
        borderRadius: radius.lg,
        backgroundColor: c.card,
      }}>
      <Skeleton width={64} height={64} round={radius.md} />
      <View style={{ flex: 1, gap: space.sm, justifyContent: 'center' }}>
        <Skeleton width="40%" height={12} />
        <Skeleton width="85%" height={16} />
        <Skeleton width="55%" height={12} />
      </View>
    </View>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View style={{ gap: space.sm, paddingTop: space.lg }} accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <EventRowSkeleton key={i} />
      ))}
    </View>
  );
}

/** Discover feed placeholder: banner, a carousel row and a list. */
export function FeedSkeleton() {
  const c = useColors();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      scrollEnabled={false}
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingTop: space.sm }}
      accessibilityLabel="Loading"
      accessibilityRole="progressbar">
      <Skeleton height={190} round={radius.lg} style={{ marginHorizontal: space.lg, width: undefined }} />
      <Skeleton width={180} height={22} style={{ marginHorizontal: space.lg, marginTop: space.xl, marginBottom: space.md }} />
      <View style={{ flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg }}>
        <Skeleton width={260} height={200} round={radius.lg} />
        <Skeleton width={260} height={200} round={radius.lg} />
      </View>
      <ListSkeleton rows={3} />
    </ScrollView>
  );
}
