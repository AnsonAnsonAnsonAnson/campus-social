import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState, ErrorView, Loading, SectionHeader, SocietyAvatar } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { formatWhen } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';

/** Review queue for the app team: new societies and banner requests. */
export default function Admin() {
  const c = useColors();
  const q = useQuery(async () => {
    const [societies, banners] = await Promise.all([api.pendingSocieties(), api.pendingBanners()]);
    return { societies, banners };
  });

  const act = (fn: () => Promise<void>) =>
    fn()
      .then(invalidate)
      .catch((e) => Alert.alert('Could not update', errorMessage(e)));

  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const { societies, banners } = q.data!;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
      {!societies.length && !banners.length && <EmptyState icon="checkmark-done-circle-outline" title="All caught up" />}

      {!!societies.length && <SectionHeader title={`Societies (${societies.length})`} />}
      {societies.map((s) => (
        <View key={s.id} style={[styles.card, { backgroundColor: c.card }]}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <SocietyAvatar name={s.name} uri={s.logo_url} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{s.name}</Text>
              <Text style={{ color: c.textSecondary }}>
                {s.category}
                {s.contact_email ? ` · ${s.contact_email}` : ''}
                {s.instagram ? ` · ${s.instagram}` : ''}
              </Text>
            </View>
          </View>
          <Text style={{ color: c.text }}>{s.description}</Text>
          <View style={styles.actions}>
            <Button small title="Approve + verify" onPress={() => act(() => api.reviewSociety(s.id, 'approved', true))} />
            <Button small variant="secondary" title="Approve" onPress={() => act(() => api.reviewSociety(s.id, 'approved', false))} />
            <Button small variant="plain" title="Reject" onPress={() => act(() => api.reviewSociety(s.id, 'rejected', false))} />
          </View>
        </View>
      ))}

      {!!banners.length && <SectionHeader title={`Banners (${banners.length})`} />}
      {banners.map((b) => (
        <View key={b.id} style={[styles.card, { backgroundColor: c.card }]}>
          <Text style={{ color: c.tint, fontWeight: '700' }}>{b.society.name}</Text>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 17 }}>{b.title}</Text>
          {b.subtitle && <Text style={{ color: c.textSecondary }}>{b.subtitle}</Text>}
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>
            {formatWhen(b.starts_at)} → {formatWhen(b.ends_at)}
          </Text>
          <View style={styles.actions}>
            <Button small title="Approve" onPress={() => act(() => api.reviewBanner(b.id, 'approved', 0))} />
            <Button
              small
              variant="secondary"
              title="Approve as featured"
              onPress={() => act(() => api.reviewBanner(b.id, 'approved', 10))}
            />
            <Button small variant="plain" title="Reject" onPress={() => act(() => api.reviewBanner(b.id, 'rejected', 0))} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: space.lg, marginBottom: space.md, padding: space.lg, borderRadius: radius.lg, gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', marginTop: space.xs },
});
