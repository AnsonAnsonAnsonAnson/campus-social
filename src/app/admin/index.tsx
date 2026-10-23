import { router } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ListSkeleton } from '@/components/Skeleton';
import { toast } from '@/components/Toast';
import { Button, EmptyState, ErrorView, Pill, SectionHeader, SocietyAvatar } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { formatAgo, formatWhen } from '@/lib/format';
import { radius, space, type, useColors } from '@/lib/theme';
import type { OpenReport } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

const TAKE_DOWN: Record<OpenReport['target_type'], string> = {
  event: 'Hide event',
  society: 'Reject society',
  banner: 'Pull banner',
};

/** Review queue for the app team: reports, new societies and banner requests. */
export default function Admin() {
  const c = useColors();
  const q = useQuery(async () => {
    const [reports, societies, banners] = await Promise.all([api.openReports(), api.pendingSocieties(), api.pendingBanners()]);
    return { reports, societies, banners };
  });

  // One card per reported item, with every reason people gave.
  const reported = useMemo(() => {
    const groups = new Map<string, OpenReport[]>();
    for (const r of q.data?.reports ?? []) {
      const key = `${r.target_type}:${r.target_id}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    return [...groups.values()].sort((a, b) => b.length - a.length);
  }, [q.data]);

  const act = (fn: () => Promise<void>, done: string) =>
    fn()
      .then(() => {
        invalidate();
        toast(done);
      })
      .catch((e) => showAlert('Could not update', errorMessage(e)));

  const takeDown = async (r: OpenReport) => {
    const ok = await confirmAsync(
      `${TAKE_DOWN[r.target_type]}?`,
      `“${r.target_name}” will no longer be shown to students. Its committee can still see it.`,
      TAKE_DOWN[r.target_type],
      true,
    );
    if (ok) act(() => api.resolveReport(r.id, 'removed'), 'Taken down');
  };

  const view = (r: OpenReport) => {
    if (r.target_type === 'event') router.push(`/event/${r.target_id}`);
    else if (r.target_type === 'society') router.push(`/society/${r.target_id}`);
  };

  if (q.loading) return <ListSkeleton rows={4} />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const { societies, banners } = q.data!;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
      {!reported.length && !societies.length && !banners.length && (
        <EmptyState icon="checkmark-done-circle-outline" title="All caught up" body="No reports or requests waiting for review." />
      )}

      {!!reported.length && <SectionHeader title={`Reports (${reported.length})`} />}
      {reported.map((group) => {
        const r = group[0];
        return (
          <View key={`${r.target_type}:${r.target_id}`} style={[styles.card, { backgroundColor: c.card }]}>
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
              <Pill label={r.target_type} tone="danger" />
              <Text style={[type.footnote, { color: c.textSecondary }]}>
                {group.length} report{group.length === 1 ? '' : 's'} · latest {formatAgo(group[group.length - 1].created_at)}
              </Text>
            </View>
            <Text style={[type.headline, { color: c.text }]}>{r.target_name}</Text>
            {group.map((g) => (
              <Text key={g.id} style={[type.subhead, { color: c.textSecondary }]}>
                “{g.reason}”
              </Text>
            ))}
            <View style={styles.actions}>
              {r.target_type !== 'banner' && <Button small variant="secondary" title="View" onPress={() => view(r)} />}
              <Button small variant="destructive" title={TAKE_DOWN[r.target_type]} onPress={() => takeDown(r)} />
              <Button
                small
                variant="plain"
                title="Dismiss"
                onPress={() => act(() => api.resolveReport(r.id, 'dismissed'), 'Report dismissed')}
              />
            </View>
          </View>
        );
      })}

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
            <Button
              small
              title="Approve + verify"
              onPress={() => act(() => api.reviewSociety(s.id, 'approved', true), 'Society approved and verified')}
            />
            <Button
              small
              variant="secondary"
              title="Approve"
              onPress={() => act(() => api.reviewSociety(s.id, 'approved', false), 'Society approved')}
            />
            <Button
              small
              variant="plain"
              title="Reject"
              onPress={() => act(() => api.reviewSociety(s.id, 'rejected', false), 'Society rejected')}
            />
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
            <Button small title="Approve" onPress={() => act(() => api.reviewBanner(b.id, 'approved', 0), 'Banner approved')} />
            <Button
              small
              variant="secondary"
              title="Approve as featured"
              onPress={() => act(() => api.reviewBanner(b.id, 'approved', 10), 'Banner featured')}
            />
            <Button
              small
              variant="plain"
              title="Reject"
              onPress={() => act(() => api.reviewBanner(b.id, 'rejected', 0), 'Banner rejected')}
            />
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
