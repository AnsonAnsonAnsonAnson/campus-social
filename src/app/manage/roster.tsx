import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { ListSkeleton } from '@/components/Skeleton';
import { toast } from '@/components/Toast';
import { ReceiptButton } from '@/components/Receipt';
import { Button, Chip, ChipRow, EmptyState, ErrorView, Icon, InfoRow, Pill, Sheet } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { membersCsv, membershipRef, membershipState } from '@/lib/commerce';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { formatHkd } from '@/lib/fps';
import { formatLongDay, todayHK } from '@/lib/format';
import { shareCsv } from '@/lib/shareFile';
import { radius, space, useColors } from '@/lib/theme';
import type { Membership, MembershipPlan, PaymentMethod } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

type Filter = 'check' | 'unpaid' | 'active' | 'past' | 'all';

const FILTER_KEYS: Record<Filter, string[]> = {
  check: ['claimed', 'pending'],
  unpaid: ['unpaid'],
  active: ['active'],
  past: ['expired', 'rejected', 'cancelled'],
  all: [],
};

const methodLabel = (m: PaymentMethod) => (m === 'cash' ? t('Cash') : m === 'payme' ? 'PayMe' : 'FPS');

export default function Roster() {
  const { societyId, export: exportNow } = useLocalSearchParams<{ societyId: string; export?: string }>();
  const c = useColors();
  const [filter, setFilter] = useState<Filter>('check');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Membership | null>(null);
  const [busy, setBusy] = useState(false);
  const exported = useRef(false);

  const q = useQuery(async () => {
    const [plans, memberships, mine] = await Promise.all([api.listPlans(societyId), api.listMemberships(societyId), api.mySocieties()]);
    const society = mine.find((s) => s.id === societyId);
    return { plans, memberships, society, isAdmin: !!society && society.role !== 'editor' };
  }, [societyId]);

  const planById = useMemo(() => new Map((q.data?.plans ?? []).map((p) => [p.id, p])), [q.data]);
  const rows = useMemo(() => {
    const today = todayHK();
    return (q.data?.memberships ?? []).map((m) => ({
      m,
      plan: planById.get(m.plan_id),
      state: membershipState(m, planById.get(m.plan_id) ?? { valid_until: today, price_hkd: 0 }),
    }));
  }, [q.data, planById]);

  const counts = useMemo(() => {
    const n = (f: Filter) => (f === 'all' ? rows.length : rows.filter((r) => FILTER_KEYS[f].includes(r.state.key)).length);
    return { check: n('check'), unpaid: n('unpaid'), active: n('active'), past: n('past'), all: n('all') };
  }, [rows]);

  // Nothing to check: start on the full active list instead of an empty tab.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q.data && counts.check === 0 && filter === 'check') setFilter('active');
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data == null]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows
      .filter((r) => filter === 'all' || FILTER_KEYS[filter].includes(r.state.key))
      .filter(
        (r) =>
          !needle ||
          [r.m.full_name, r.m.email, r.m.student_id, r.m.phone, membershipRef(r.m), r.m.member_no ? `#${r.m.member_no}` : '']
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle)),
      )
      .sort((a, b) => (a.m.member_no ?? 1e9) - (b.m.member_no ?? 1e9) || a.m.full_name.localeCompare(b.m.full_name));
  }, [rows, filter, search]);

  const doExport = async () => {
    if (!q.data) return;
    const { plans, memberships, society } = q.data;
    try {
      await api.logMembershipExport(societyId, memberships.length);
      const name = (society?.short_name ?? society?.name ?? 'members').replace(/[^\w-]+/g, '-');
      await shareCsv(`${name}-members-${todayHK()}.csv`, membersCsv(memberships, plans));
    } catch (e) {
      showAlert(t('Something went wrong'), errorMessage(e));
    }
  };

  useEffect(() => {
    if (exportNow === '1' && q.data && !exported.current) {
      exported.current = true;
      doExport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportNow, q.data]);

  const setStatus = async (ids: string[], status: 'active' | 'rejected' | 'pending', done: string) => {
    setBusy(true);
    try {
      await api.setMembershipStatus(ids, status);
      invalidate();
      setOpen(null);
      toast(done);
      q.refresh();
    } catch (e) {
      showAlert(t('Something went wrong'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const approveAll = async () => {
    const ids = visible.filter((r) => r.state.key === 'claimed' || r.state.key === 'pending').map((r) => r.m.id);
    if (!ids.length) return;
    const ok = await confirmAsync(
      t('Approve {n} members?', { n: ids.length }),
      t('Only approve people whose payment you can see in your bank or PayMe app.'),
      t('Approve'),
    );
    if (ok) setStatus(ids, 'active', t('{n} members approved', { n: ids.length }));
  };

  if (q.loading && !q.data) return <ListSkeleton rows={6} />;
  if (q.error && !q.data) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const isAdmin = q.data!.isAdmin;
  const bulk = isAdmin && filter === 'check' && visible.length > 1;

  return (
    <View style={{ flex: 1, backgroundColor: c.backgroundPlain }}>
      <Stack.Screen
        options={{
          title: t('Members'),
          headerRight: () => (
            <Pressable
              onPress={doExport}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('Export member list')}
              style={styles.headerButton}>
              <Icon name="download-outline" size={22} color={c.tint} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={visible}
        keyExtractor={(r) => r.m.id}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}
        contentContainerStyle={{ paddingBottom: bulk ? 120 : 40, flexGrow: 1 }}
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={{ gap: space.sm, paddingTop: space.md, paddingBottom: space.sm }}>
            <View style={[styles.search, { backgroundColor: c.fill }]}>
              <Icon name="search" size={18} color={c.textSecondary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('Name, student ID, email or ref')}
                placeholderTextColor={c.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                accessibilityLabel={t('Search members')}
                style={[styles.searchInput, { color: c.text }]}
              />
            </View>
            <ChipRow>
              <Chip
                label={`${t('To check')} ${counts.check || ''}`.trim()}
                selected={filter === 'check'}
                onPress={() => setFilter('check')}
              />
              <Chip
                label={`${t('Not paid')} ${counts.unpaid || ''}`.trim()}
                selected={filter === 'unpaid'}
                onPress={() => setFilter('unpaid')}
              />
              <Chip
                label={`${t('Active')} ${counts.active || ''}`.trim()}
                selected={filter === 'active'}
                onPress={() => setFilter('active')}
              />
              <Chip label={t('Past')} selected={filter === 'past'} onPress={() => setFilter('past')} />
              <Chip label={t('All')} selected={filter === 'all'} onPress={() => setFilter('all')} />
            </ChipRow>
          </View>
        }
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: c.border }]} />}
        renderItem={({ item: r }) => (
          <Pressable
            onPress={() => setOpen(r.m)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.fill : 'transparent' }]}>
            <View style={[styles.no, { backgroundColor: c.fill }]}>
              <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {r.m.member_no ? `#${r.m.member_no}` : '–'}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
                {r.m.full_name}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={1}>
                {[
                  r.m.student_id,
                  membershipRef(r.m),
                  r.m.payment_method ? methodLabel(r.m.payment_method) : null,
                  r.m.imported ? t('Imported') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {!!r.m.receipt_path && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="image-outline" size={14} color={c.infoText} />
                  <Text style={{ color: c.infoText, fontSize: 13 }}>{t('Screenshot attached')}</Text>
                </View>
              )}
            </View>
            <Pill label={r.state.label} tone={r.state.tone} />
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState
            icon={filter === 'check' ? 'checkmark-done-outline' : 'people-outline'}
            title={search ? t('No one matches “{q}”', { q: search }) : filter === 'check' ? t('All caught up') : t('No members here yet')}
            body={filter === 'check' && !search ? t('New sign-ups and payments to check will show up here.') : undefined}
          />
        }
      />
      {bulk && (
        <View style={[styles.bulk, { backgroundColor: c.backgroundPlain, borderTopColor: c.border }]}>
          <Button
            variant="ink"
            icon="checkmark-done"
            title={t('Approve all {n}', { n: visible.length })}
            loading={busy}
            onPress={approveAll}
          />
        </View>
      )}
      <MemberSheet
        membership={open}
        plan={open ? planById.get(open.plan_id) : undefined}
        isAdmin={isAdmin}
        busy={busy}
        onClose={() => setOpen(null)}
        onStatus={setStatus}
      />
    </View>
  );
}

function MemberSheet({
  membership: m,
  plan,
  isAdmin,
  busy,
  onClose,
  onStatus,
}: {
  membership: Membership | null;
  plan?: MembershipPlan;
  isAdmin: boolean;
  busy: boolean;
  onClose: () => void;
  onStatus: (ids: string[], status: 'active' | 'rejected' | 'pending', done: string) => void;
}) {
  const c = useColors();
  if (!m)
    return (
      <Sheet visible={false} onClose={onClose}>
        {null}
      </Sheet>
    );
  const state = membershipState(m, plan ?? { valid_until: todayHK(), price_hkd: 0 });
  const paid = (plan?.price_hkd ?? 0) > 0;
  return (
    <Sheet visible onClose={onClose}>
      <View style={{ gap: space.md, paddingHorizontal: space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '700', flex: 1 }} numberOfLines={2}>
            {m.full_name}
          </Text>
          <Pill label={state.label} tone={state.tone} />
        </View>
        <View style={{ gap: space.sm }}>
          <InfoRow icon="mail-outline" title={m.email} sub={[m.student_id, m.phone].filter(Boolean).join(' · ') || undefined} />
          {(m.college || m.major) && (
            <InfoRow icon="school-outline" title={m.major || t('No major given')} sub={m.college ? t(m.college) : undefined} />
          )}
          {plan && (
            <InfoRow
              icon="card-outline"
              title={plan.name}
              sub={`${paid ? formatHkd(plan.price_hkd) : t('Free')} · ${t('Valid until {date}', { date: formatLongDay(plan.valid_until) })}`}
            />
          )}
          {paid && (
            <InfoRow
              icon="cash-outline"
              title={t('Reference {ref}', { ref: membershipRef(m) })}
              sub={
                m.paid_at
                  ? t('Paid {date}', { date: formatLongDay(m.paid_at.slice(0, 10)) })
                  : m.claimed_paid_at
                    ? t('Says they paid by {method}. Check your account for this reference.', {
                        method: methodLabel(m.payment_method ?? 'fps'),
                      })
                    : t('Not paid yet')
              }
              subColor={m.claimed_paid_at && !m.paid_at ? c.infoText : undefined}
            />
          )}
          {plan?.questions.map((qu, i) =>
            m.answers[i] ? <InfoRow key={i} icon="chatbubble-ellipses-outline" title={m.answers[i]} sub={qu} /> : null,
          )}
        </View>
        {isAdmin && <ReceiptButton path={m.receipt_path} at={m.receipt_at} />}
        {isAdmin ? (
          <View style={{ gap: space.sm }}>
            {(state.key === 'claimed' || state.key === 'pending' || state.key === 'unpaid') && (
              <Button
                variant="ink"
                icon="checkmark"
                loading={busy}
                title={paid ? t('Mark paid and approve') : t('Approve')}
                onPress={() => onStatus([m.id], 'active', t('{name} is now a member', { name: m.full_name }))}
              />
            )}
            {state.key === 'claimed' && (
              <Button
                variant="secondary"
                title={t('Payment not received')}
                disabled={busy}
                onPress={() => onStatus([m.id], 'pending', t('Sent back to waiting for payment'))}
              />
            )}
            {state.key === 'rejected' && (
              <Button
                variant="secondary"
                title={t('Approve after all')}
                disabled={busy}
                onPress={() => onStatus([m.id], 'active', t('Approved'))}
              />
            )}
            {state.key !== 'rejected' && state.key !== 'cancelled' && state.key !== 'expired' && (
              <Button
                variant="destructive"
                title={state.key === 'active' ? t('Remove membership') : t('Don’t approve')}
                disabled={busy}
                onPress={async () => {
                  const ok = await confirmAsync(
                    state.key === 'active' ? t('Remove {name}?', { name: m.full_name }) : t('Don’t approve {name}?', { name: m.full_name }),
                    t('Their member card stops working. Any refund happens outside the app.'),
                    state.key === 'active' ? t('Remove') : t('Don’t approve'),
                    true,
                  );
                  if (ok) onStatus([m.id], 'rejected', t('Updated'));
                }}
              />
            )}
          </View>
        ) : (
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('Only society admins can approve members.')}</Text>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: radius.md,
  },
  searchInput: { flex: 1, fontSize: 16, height: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  no: { minWidth: 44, height: 32, paddingHorizontal: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: space.lg + 44 + space.md },
  bulk: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.lg,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
