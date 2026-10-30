import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { PaymentPanel } from '@/components/Payment';
import { ReceiptUpload } from '@/components/Receipt';
import { toast } from '@/components/Toast';
import { Banner, Button, ErrorView, Loading } from '@/components/ui';
import { MemberCard } from '@/components/Wallet';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { membershipRef, membershipState } from '@/lib/commerce';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { space, type, useColors } from '@/lib/theme';
import { walletWithFallback } from '@/lib/ticketCache';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

/** A member card, or (while it waits for the committee) how to pay for it. */
export default function MembershipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const q = useQuery(async () => {
    if (!user) return null;
    const wallet = await walletWithFallback(user.id, async () => {
      const [memberships, orders] = await Promise.all([api.myMemberships(), api.myOrders()]);
      return { memberships, orders };
    });
    const m = wallet.memberships.find((x) => x.id === id) ?? null;
    const settings = m && !wallet.offline ? await api.getPaymentSettings(m.society_id) : null;
    return { m, settings, offline: wallet.offline };
  }, [id, user?.id]);

  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const m = q.data?.m;
  if (!m) return <ErrorView message={t('Membership not found')} />;
  const state = membershipState(m, m.plan);

  const claim = async () => {
    setBusy(true);
    try {
      await api.claimMembershipPaid(m.id);
      invalidate();
      toast(t('Thanks! The treasurer will check and confirm.'));
    } catch (e) {
      showAlert(t('Could not update'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    const pending = m.status === 'pending';
    if (
      !(await confirmAsync(
        pending ? t('Withdraw your application?') : t('Leave {society}?', { society: m.society.short_name ?? m.society.name }),
        pending ? t('The committee will no longer see it.') : t('Your member card stops working. Fees are not refunded in the app.'),
        pending ? t('Withdraw') : t('Leave'),
        true,
      ))
    )
      return;
    try {
      await api.cancelMembership(m.id);
      invalidate();
      router.back();
    } catch (e) {
      showAlert(t('Could not update'), errorMessage(e));
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingVertical: space.lg, gap: space.lg, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
      <Stack.Screen options={{ title: t('Member card') }} />
      <MemberCard membership={m} />

      {q.data?.offline && (
        <Banner icon="cloud-done-outline" text={t('Offline. Your card is saved on this phone and still works at the door.')} />
      )}

      {state.key === 'unpaid' && (
        <View style={{ marginHorizontal: space.lg, gap: space.md }}>
          <Text style={[type.title2, { color: c.text }]}>{t('Pay your membership fee')}</Text>
          <PaymentPanel
            settings={q.data?.settings ?? null}
            amount={m.plan.price_hkd}
            reference={membershipRef(m)}
            method={m.payment_method}
          />
          {m.payment_method !== 'cash' && <Button title={t("I've paid")} icon="checkmark" loading={busy} onPress={claim} />}
        </View>
      )}
      {state.key === 'claimed' && (
        <Banner icon="hourglass-outline" text={t('Thanks! The treasurer will check your payment and confirm your membership.')} />
      )}
      {(state.key === 'unpaid' || state.key === 'claimed') && m.payment_method !== 'cash' && !q.data?.offline && (
        <View style={{ marginHorizontal: space.lg }}>
          <ReceiptUpload kind="membership" record={m} />
        </View>
      )}
      {state.key === 'pending' && <Banner icon="hourglass-outline" text={t('The committee will review your application soon.')} />}

      {!!m.plan.questions.length && (
        <View style={{ marginHorizontal: space.lg, gap: space.sm }}>
          {m.plan.questions.map((question, i) => (
            <View key={i}>
              <Text style={[type.footnote, { color: c.textSecondary }]}>{question}</Text>
              <Text style={[type.body, { color: c.text }]}>{m.answers[i] || '—'}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={[type.footnote, { color: c.textSecondary, marginHorizontal: space.lg }]}>
        {t('{society} keeps your name, student ID, college, major and phone for its member list.', { society: m.society.name })}
      </Text>
      <Button
        variant="dangerText"
        title={m.status === 'pending' ? t('Withdraw application') : t('Leave society')}
        onPress={leave}
        style={{ marginHorizontal: space.lg }}
      />
    </ScrollView>
  );
}
