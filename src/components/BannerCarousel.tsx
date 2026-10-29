import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { formatWhen } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';
import type { BannerWithLinks } from '@/lib/types';
import { t } from '@/lib/i18n';

import { Artwork } from './ui';

const AUTO_ADVANCE_MS = 5000;

/** Promoted events at the top of Discover. Auto-advances, swipeable, tappable. */
export function BannerCarousel({ banners }: { banners: BannerWithLinks[] }) {
  const { width } = useWindowDimensions();
  const c = useColors();
  const cardWidth = width - space.lg * 2;
  const step = cardWidth + space.sm;
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<BannerWithLinks>>(null);
  const touching = useRef(false);

  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => {
      if (touching.current) return;
      setIndex((i) => {
        const next = (i + 1) % banners.length;
        listRef.current?.scrollToOffset({ offset: next * step, animated: true });
        return next;
      });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(t);
  }, [banners.length, step]);

  if (!banners.length) return null;

  return (
    <View>
      <FlatList
        ref={listRef}
        data={banners}
        horizontal
        keyExtractor={(b) => b.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}
        onScrollBeginDrag={() => (touching.current = true)}
        onMomentumScrollEnd={(e) => {
          touching.current = false;
          setIndex(Math.round(e.nativeEvent.contentOffset.x / step));
        }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Promoted: {title}', { title: item.title })}
            onPress={() => router.push(item.event_id ? `/event/${item.event_id}` : `/society/${item.society_id}`)}>
            <Artwork seed={item.id} uri={item.image_url} category={item.event?.category} style={[styles.banner, { width: cardWidth }]}>
              <View style={styles.scrim} />
              <View style={styles.content}>
                <Text style={styles.kicker}>{item.society.short_name ?? item.society.name}</Text>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                {!!(item.subtitle || item.event) && (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {item.subtitle ?? formatWhen(item.event!.starts_at)}
                  </Text>
                )}
              </View>
            </Artwork>
          </Pressable>
        )}
      />
      {banners.length > 1 && (
        <View style={styles.dots}>
          {banners.map((b, i) => (
            <View key={b.id} style={[styles.dot, { backgroundColor: i === index ? c.brand : c.border, width: i === index ? 18 : 6 }]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { height: 190, borderRadius: radius.lg, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.25)' },
  content: { padding: space.lg, gap: 4 },
  kicker: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: '500' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space.sm },
  dot: { height: 6, borderRadius: 3 },
});
