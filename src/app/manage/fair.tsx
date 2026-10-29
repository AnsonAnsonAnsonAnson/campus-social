import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { toast } from '@/components/Toast';
import {
  Banner,
  Button,
  EmptyState,
  ErrorView,
  Field,
  ListGroup,
  ListRow,
  Loading,
  Pill,
  SectionHeader,
  Sheet,
  SocietyAvatar,
  StatTile,
} from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { fairState } from '@/lib/commerce';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { formatHkd } from '@/lib/fps';
import { formatWhen } from '@/lib/format';
import { t, useLang } from '@/lib/i18n';
import { radius, space, textStyle, useColors } from '@/lib/theme';
import type { FairBooth, ReviewState } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

/** The organiser's desk: booth requests, booth numbers, and presale at each booth. */
export default function ManageFair() {
  const { fairId } = useLocalSearchParams<{ fairId: string }>();
  const c = useColors();
  const lang = useLang();
  const [editing, setEditing] = useState<FairBooth | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery(async () => {
    const [fair, sales] = await Promise.all([api.getFair(fairId), api.fairSales(fairId).catch(() => [])]);
    return { fair, sales };
  }, [fairId]);

  if (q.loading && !q.data) return <Loading />;
  if (q.error && !q.data) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const f = q.data?.fair;
  if (!f) return <ErrorView message={t('This fair is not listed')} />;

  const sales = q.data!.sales;
  const requests = f.booths.filter((b) => b.status === 'pending');
  const confirmed = f.booths.filter((b) => b.status === 'approved');
  const total = sales.reduce((n, s) => n + s.sales_hkd, 0);
  const orders = sales.reduce((n, s) => n + s.orders, 0);
  const vouchersSold = sales.reduce((n, s) => n + s.vouchers_sold, 0);
  const vouchersUsed = sales.reduce((n, s) => n + s.vouchers_used, 0);
  const state = fairState(f);

  const review = async (b: FairBooth, status: ReviewState, boothLabel: string | null) => {
    if (
      status === 'rejected' &&
      !(await confirmAsync(
        t('Decline this booth?'),
        t('{name} will be told there is no booth this time.', { name: b.society.name }),
        t('Decline'),
        true,
      ))
    ) {
      return;
    }
    setBusy(b.id);
    try {
      await api.reviewBooth(b.id, status, boothLabel);
      invalidate();
      setEditing(null);
      toast(status === 'approved' ? t('Booth confirmed') : t('Booth declined'));
    } catch (e) {
      showAlert(t('Something went wrong'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const open = (b: FairBooth) => {
    setLabel(b.label ?? '');
    setEditing(b);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: t('Fair') }} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
        <View style={{ padding: space.lg, gap: space.sm }}>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Pill label={state.label} tone={state.tone} />
            {f.status !== 'approved' && (
              <Pill
                label={f.status === 'pending' ? t('Pending review') : t('Rejected')}
                tone={f.status === 'pending' ? 'warning' : 'danger'}
              />
            )}
            {!f.booths_open && <Pill label={t('Booth requests closed')} tone="neutral" />}
          </View>
          <Text style={[textStyle('title2', lang), { color: c.text }]}>{f.name}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 15 }}>
            {formatWhen(f.starts_at, f.ends_at)} · {f.venue}
          </Text>
        </View>
        {f.status === 'pending' && (
          <View style={{ marginBottom: space.md }}>
            <Banner
              icon="hourglass-outline"
              tone="warning"
              text={t('The app team is checking your fair. Students and societies will see it once it is approved.')}
            />
          </View>
        )}

        <View style={styles.stats}>
          <StatTile value={String(confirmed.length)} label={t('Booths')} />
          <StatTile value={String(requests.length)} label={t('Requests')} tone={requests.length ? 'warning' : undefined} />
          <StatTile value={formatHkd(total)} label={t('Presale')} tone="success" />
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, marginHorizontal: space.lg }}>
          <Button
            style={{ flex: 1 }}
            variant="secondary"
            icon="create-outline"
            title={t('Edit fair')}
            onPress={() => router.push({ pathname: '/manage/fair-form', params: { fairId: f.id } })}
          />
          <Button
            style={{ flex: 1 }}
            variant="secondary"
            icon="eye-outline"
            title={t('Fair page')}
            onPress={() => router.push(`/fair/${f.id}`)}
          />
        </View>

        <SectionHeader title={requests.length ? t('Booth requests ({n})', { n: requests.length }) : t('Booth requests')} />
        {requests.length ? (
          <View style={{ gap: space.sm }}>
            {requests.map((b) => (
              <View key={b.id} style={[styles.card, { backgroundColor: c.card }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <SocietyAvatar name={b.society.name} uri={b.society.logo_url} category={b.society.category} size={32} />
                  <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                    {b.society.name}
                  </Text>
                </View>
                {!!b.note && <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 20 }}>“{b.note}”</Text>}
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button small style={{ flex: 1 }} title={t('Confirm and number')} icon="checkmark" onPress={() => open(b)} />
                  <Button
                    small
                    variant="secondary"
                    title={t('Decline')}
                    loading={busy === b.id}
                    onPress={() => review(b, 'rejected', b.label)}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: c.textSecondary, fontSize: 14, marginHorizontal: space.lg }}>
            {f.booths_open ? t('No requests waiting. Share the fair page with societies.') : t('Booth requests are closed.')}
          </Text>
        )}

        <SectionHeader title={t('Presale by booth')} />
        {confirmed.length ? (
          <>
            <ListGroup>
              {confirmed.map((b) => {
                const s = sales.find((x) => x.society_id === b.society_id);
                return (
                  <ListRow
                    key={b.id}
                    icon="storefront-outline"
                    title={`${b.label ? `${b.label} · ` : ''}${b.society.name}`}
                    subtitle={
                      s && s.orders
                        ? [
                            t('{n} orders', { n: s.orders }),
                            s.vouchers_sold ? t('{used}/{sold} vouchers used', { used: s.vouchers_used, sold: s.vouchers_sold }) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : t('No presale yet')
                    }
                    value={formatHkd(s?.sales_hkd ?? 0)}
                    onPress={() => open(b)}
                  />
                );
              })}
            </ListGroup>
            <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19, marginHorizontal: space.lg, marginTop: space.sm }}>
              {t('{orders} paid orders, {sold} food vouchers sold, {used} used so far. Each booth is paid directly; you see totals only.', {
                orders,
                sold: vouchersSold,
                used: vouchersUsed,
              })}
            </Text>
          </>
        ) : (
          <EmptyState icon="storefront-outline" title={t('No booths yet')} body={t('Confirm booth requests to see them here.')} />
        )}
      </ScrollView>

      <Sheet visible={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
            <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>{editing.society.name}</Text>
            <Field
              label={t('Booth number')}
              value={label}
              onChangeText={setLabel}
              maxLength={20}
              autoCapitalize="characters"
              placeholder={t('e.g. B12')}
              hint={t('Shown on the fair page and on buyers’ orders, so they find the booth.')}
            />
            <Button
              title={editing.status === 'approved' ? t('Save') : t('Confirm booth')}
              icon="checkmark"
              loading={busy === editing.id}
              onPress={() => review(editing, 'approved', label)}
            />
            {editing.status === 'approved' && (
              <Button variant="plain" title={t('Remove booth')} onPress={() => review(editing, 'rejected', editing.label)} />
            )}
          </View>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space.sm, marginHorizontal: space.lg, marginBottom: space.lg },
  card: { marginHorizontal: space.lg, padding: space.lg, borderRadius: radius.lg, gap: space.md },
});
