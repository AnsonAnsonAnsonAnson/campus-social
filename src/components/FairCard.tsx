import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fairState } from '@/lib/commerce';
import { formatWhen } from '@/lib/format';
import { t } from '@/lib/i18n';
import { radius, space } from '@/lib/theme';
import type { FairWithCounts } from '@/lib/types';

import { Artwork, Pill } from './ui';

/** A fair on Discover and in the fairs list: cover, dates, booths, presale. */
export function FairCard({ fair: f, width }: { fair: FairWithCounts; width: number }) {
  const state = fairState(f);
  return (
    <Pressable
      onPress={() => router.push(`/fair/${f.id}`)}
      accessibilityRole="button"
      accessibilityLabel={f.name}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }]}>
      <Artwork seed={f.id} uri={f.cover_url} category="Social" style={[styles.art, { width, height: width * 0.56 }]}>
        <View style={styles.shade} />
        <View style={styles.top}>
          <Pill label={state.label} tone={state.tone} icon={state.key === 'on' ? 'radio-button-on' : null} />
          {state.presaleOpen && state.key !== 'over' && f.product_count > 0 && (
            <Pill label={t('Presale open')} tone="success" icon="flash-outline" />
          )}
          {f.status === 'pending' && <Pill label={t('Pending review')} tone="warning" />}
        </View>
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={2}>
            {f.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {formatWhen(f.starts_at, f.ends_at)}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {f.venue} · {t('{n} booths', { n: f.booth_count })}
          </Text>
        </View>
      </Artwork>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  art: { borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'space-between' },
  shade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.38)' },
  top: { flexDirection: 'row', gap: space.xs, padding: space.md, flexWrap: 'wrap' },
  text: { padding: space.md, gap: 2 },
  name: { color: '#fff', fontSize: 20, fontWeight: '700' },
  meta: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500' },
});
