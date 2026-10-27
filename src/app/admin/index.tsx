import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ListSkeleton } from '@/components/Skeleton';
import { toast } from '@/components/Toast';
import { Button, EmptyState, ErrorView, Pill, SocietyAvatar, UnderlineTabs } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { formatAgo, formatWhen } from '@/lib/format';
import { radius, space, textStyle, type, useColors } from '@/lib/theme';
import type { OpenReport } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { t, useLang } from '@/lib/i18n';

const takeDownLabel = (type: OpenReport['target_type']) =>
  ({
    event: t('Hide event'),
    society: t('Reject society'),
    banner: t('Pull banner'),
  })[type];

/** Review queue for the app team: reports, new societies and banner requests. */
export default function Admin() {
  const c = useColors();
  const lang = useLang();
  const [tab, setTab] = useState<'societies' | 'banners' | 'reports' | null>(null);
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
      .catch((e) => showAlert(t('Could not update'), errorMessage(e)));

  const takeDown = async (r: OpenReport) => {
    const ok = await confirmAsync(
      t('{action}?', { action: takeDownLabel(r.target_type) }),
      t('“{name}” will no longer be shown to students. Its committee can still see it.', { name: r.target_name }),
      takeDownLabel(r.target_type),
      true,
    );
    if (ok) act(() => api.resolveReport(r.id, 'removed'), t('Taken down'));
  };

  const view = (r: OpenReport) => {
    if (r.target_type === 'event') router.push(`/event/${r.target_id}`);
    else if (r.target_type === 'society') router.push(`/society/${r.target_id}`);
  };

  if (q.loading) return <ListSkeleton rows={4} />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const { societies, banners } = q.data!;
  // Open on whichever list has something waiting, reports first.
  const current = tab ?? (reported.length ? 'reports' : societies.length ? 'societies' : banners.length ? 'banners' : 'reports');

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
      <Stack.Screen options={{ title: '' }} />
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, gap: 2 }}>
        <Text style={[textStyle('largeTitle', lang), { color: c.text }]} accessibilityRole="header">
          {t('Review queue')}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 15 }}>
          {t('{n} items waiting', { n: reported.length + societies.length + banners.length })}
        </Text>
      </View>
      <View style={{ marginBottom: space.md }}>
        <UnderlineTabs
          value={current}
          onChange={setTab}
          tabs={[
            { value: 'societies', label: t('Societies'), count: societies.length },
            { value: 'banners', label: t('Banners'), count: banners.length },
            { value: 'reports', label: t('Reports'), count: reported.length, urgent: true },
          ]}
        />
      </View>
      {((current === 'reports' && !reported.length) ||
        (current === 'societies' && !societies.length) ||
        (current === 'banners' && !banners.length)) && (
        <EmptyState
          icon="checkmark-done-circle-outline"
          title={t('All caught up')}
          body={t('No reports or requests waiting for review.')}
        />
      )}

      {current === 'reports' &&
        reported.map((group) => {
          const r = group[0];
          return (
            <View key={`${r.target_type}:${r.target_id}`} style={[styles.card, { backgroundColor: c.card }]}>
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                <Pill label={t(r.target_type)} tone="danger" />
                <Text style={[type.footnote, { color: c.textSecondary }]}>
                  {group.length === 1 ? t('1 report') : t('{n} reports', { n: group.length })} ·{' '}
                  {t('latest {ago}', { ago: formatAgo(group[group.length - 1].created_at) })}
                </Text>
              </View>
              <Text style={[type.headline, { color: c.text }]}>{r.target_name}</Text>
              {group.map((g) => (
                <Text key={g.id} style={[type.subhead, { color: c.textSecondary }]}>
                  “{g.reason}”
                </Text>
              ))}
              <View style={styles.actions}>
                {r.target_type !== 'banner' && <Button small variant="secondary" title={t('View')} onPress={() => view(r)} />}
                <Button small variant="destructive" title={takeDownLabel(r.target_type)} onPress={() => takeDown(r)} />
                <Button
                  small
                  variant="plain"
                  title={t('Dismiss')}
                  onPress={() => act(() => api.resolveReport(r.id, 'dismissed'), t('Report dismissed'))}
                />
              </View>
            </View>
          );
        })}

      {current === 'societies' &&
        societies.map((s) => (
          <View key={s.id} style={[styles.card, { backgroundColor: c.card }]}>
            <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <SocietyAvatar name={s.name} uri={s.logo_url} category={s.category} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{s.name}</Text>
                <Text style={{ color: c.textSecondary }}>
                  {t(s.category)}
                  {s.contact_email ? ` · ${s.contact_email}` : ''}
                  {s.instagram ? ` · ${s.instagram}` : ''}
                </Text>
              </View>
            </View>
            <Text style={{ color: c.text }}>{s.description}</Text>
            <View style={styles.actions}>
              <Button
                small
                variant="ink"
                title={t('Approve + verify')}
                onPress={() => act(() => api.reviewSociety(s.id, 'approved', true), t('Society approved and verified'))}
              />
              <Button
                small
                variant="secondary"
                title={t('Approve')}
                onPress={() => act(() => api.reviewSociety(s.id, 'approved', false), t('Society approved'))}
              />
              <Button
                small
                variant="plain"
                title={t('Reject')}
                onPress={() => act(() => api.reviewSociety(s.id, 'rejected', false), t('Society rejected'))}
              />
            </View>
          </View>
        ))}

      {current === 'banners' &&
        banners.map((b) => (
          <View key={b.id} style={[styles.card, { backgroundColor: c.card }]}>
            <Text style={{ color: c.tintText, fontWeight: '700' }}>{b.society.name}</Text>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 17 }}>{b.title}</Text>
            {b.subtitle && <Text style={{ color: c.textSecondary }}>{b.subtitle}</Text>}
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>
              {formatWhen(b.starts_at)} → {formatWhen(b.ends_at)}
            </Text>
            <View style={styles.actions}>
              <Button
                small
                variant="ink"
                title={t('Approve')}
                onPress={() => act(() => api.reviewBanner(b.id, 'approved', 0), t('Banner approved'))}
              />
              <Button
                small
                variant="secondary"
                title={t('Approve as featured')}
                onPress={() => act(() => api.reviewBanner(b.id, 'approved', 10), t('Banner featured'))}
              />
              <Button
                small
                variant="plain"
                title={t('Reject')}
                onPress={() => act(() => api.reviewBanner(b.id, 'rejected', 0), t('Banner rejected'))}
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
