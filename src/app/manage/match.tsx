import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { toast } from '@/components/Toast';
import { Banner, Button, EmptyState, ErrorView, Field, Icon, Loading } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { isExpired, matchStatement, membershipRef, type PaymentToMatch } from '@/lib/commerce';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { formatHkd } from '@/lib/fps';
import { radius, space, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

/**
 * Treasurer's shortcut: paste the bank's or PayMe's list of incoming payments
 * and tick off every order, ticket and membership whose reference appears in
 * it. The app never sees the bank account; the treasurer copies the text.
 */
export default function MatchStatement() {
  const { societyId } = useLocalSearchParams<{ societyId: string }>();
  const c = useColors();
  const [text, setText] = useState('');
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const q = useQuery(async () => {
    const [orders, memberships, plans] = await Promise.all([
      api.listOrders(societyId),
      api.listMemberships(societyId),
      api.listPlans(societyId),
    ]);
    const price = new Map(plans.map((p) => [p.id, p.price_hkd]));
    const outstanding: PaymentToMatch[] = [
      ...orders
        .filter((o) => o.status === 'payment_claimed' || (o.status === 'awaiting_payment' && !isExpired(o)))
        .map((o) => ({ kind: 'order' as const, id: o.id, ref: o.ref, amount: o.total_hkd, name: o.buyer_name })),
      ...memberships
        .filter((m) => m.status === 'pending' && !m.paid_at && (price.get(m.plan_id) ?? 0) > 0)
        .map((m) => ({
          kind: 'membership' as const,
          id: m.id,
          ref: membershipRef(m),
          amount: price.get(m.plan_id) ?? 0,
          name: m.full_name,
        })),
    ];
    return outstanding;
  }, [societyId]);

  const matches = useMemo(() => matchStatement(text, q.data ?? []), [text, q.data]);
  const chosen = matches.filter((m) => m.amountMatches !== skipped.has(m.id));

  if (q.loading && !q.data) return <Loading />;
  if (q.error && !q.data) return <ErrorView message={q.error} onRetry={q.refresh} />;

  const toggle = (id: string) =>
    setSkipped((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const paste = async () => {
    const clip = await Clipboard.getStringAsync();
    if (clip.trim()) setText(clip);
  };

  const markPaid = async () => {
    const ok = await confirmAsync(
      t('Mark {n} payments received?', { n: chosen.length }),
      t('Each person is told their payment arrived. Orders and tickets become paid; members get their card.'),
      t('Mark paid'),
    );
    if (!ok) return;
    setBusy(true);
    try {
      const orderIds = chosen.filter((m) => m.kind === 'order').map((m) => m.id);
      const memberIds = chosen.filter((m) => m.kind === 'membership').map((m) => m.id);
      if (orderIds.length) await api.setOrderStatus(orderIds, 'paid');
      if (memberIds.length) await api.setMembershipStatus(memberIds, 'active');
      invalidate();
      toast(t('{n} payments marked received', { n: chosen.length }));
      router.back();
    } catch (e) {
      showAlert(t('Something went wrong'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: t('Match bank statement') }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: c.textSecondary, fontSize: 15, lineHeight: 22 }}>
          {t(
            'In your bank or PayMe business app, copy the list of incoming payments and paste it here. Every payment that mentions a reference we are waiting for is found for you.',
          )}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('Waiting for payment: {n}', { n: q.data?.length ?? 0 })}</Text>
        <Field
          label={t('Incoming payments')}
          value={text}
          onChangeText={setText}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={'27/10  FPS CHAN T** M** SSM-4821  HK$540.00\n27/10  PAYME  M-3F9A2C  50.00'}
          style={{ minHeight: 140, fontVariant: ['tabular-nums'] }}
        />
        <Button small variant="secondary" icon="clipboard-outline" title={t('Paste')} onPress={paste} />

        {!!text.trim() &&
          (matches.length ? (
            <View style={{ gap: space.sm }}>
              <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>{t('Found {n}', { n: matches.length })}</Text>
              {matches.map((m) => {
                const on = m.amountMatches !== skipped.has(m.id);
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => toggle(m.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={[styles.row, { backgroundColor: c.card }]}>
                    <Icon name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? c.tint : c.textTertiary} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>
                        {m.ref} · {m.name}
                      </Text>
                      <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                        {m.kind === 'membership' ? t('Membership') : t('Order')} · {formatHkd(m.amount)}
                      </Text>
                      {!m.amountMatches && (
                        <Text style={{ color: c.warningText, fontSize: 13 }}>{t('Amount doesn’t match, check before ticking')}</Text>
                      )}
                      <Text style={{ color: c.textTertiary, fontSize: 12 }} numberOfLines={1}>
                        {m.line}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <EmptyState
              icon="search-outline"
              title={t('No references found')}
              body={t('Check the payers used the reference. Payments without one still need checking by hand.')}
            />
          ))}
        <Banner icon="lock-closed-outline" text={t('The pasted text stays on this phone. Only the matches you mark are saved.')} />
      </ScrollView>
      {chosen.length > 0 && (
        <View style={[styles.bulk, { backgroundColor: c.background, borderTopColor: c.border }]}>
          <Button variant="ink" icon="checkmark-done" loading={busy} title={t('Mark {n} paid', { n: chosen.length })} onPress={markPaid} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.lg, alignItems: 'flex-start' },
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
