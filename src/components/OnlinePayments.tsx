import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api, errorMessage, invalidate } from '@/lib/api';
import { feeLabel, platformFeeHkd } from '@/lib/commerce';
import { showAlert } from '@/lib/dialog';
import { formatHkd } from '@/lib/fps';
import { t } from '@/lib/i18n';
import { openProviderPage } from '@/lib/payments';
import { radius, space, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';

import { Button, Pill } from './ui';

/**
 * Shop settings: turn on online payments (card, Apple Pay, Google Pay, Alipay,
 * WeChat Pay). A society admin goes through the provider's own pages once to
 * prove who they are and add a bank account; after that buyers can pay in the
 * app and the money arrives with the weekly payout, less the platform fee.
 */
export function OnlinePaymentsCard({ societyId }: { societyId: string }) {
  const c = useColors();
  // Coming back from the provider's pages reopens this screen; check the account then.
  const { retry } = useLocalSearchParams<{ retry?: string }>();
  const q = useQuery(async () => {
    const [account, fee] = await Promise.all([api.payoutAccount(societyId), api.platformFee(societyId)]);
    return { account, fee };
  }, [societyId]);
  const [busy, setBusy] = useState<'setup' | 'refresh' | 'dashboard' | null>(null);
  const checked = useRef(false);

  const refresh = async (quiet = false) => {
    setBusy('refresh');
    try {
      await api.refreshPayoutAccount(societyId);
      invalidate();
      q.refresh();
    } catch (e) {
      if (!quiet) showAlert(t('Could not check'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const account = q.data?.account ?? null;
  useEffect(() => {
    // Someone returning from setup sees the latest status without tapping anything.
    if (checked.current || !account || account.charges_enabled) return;
    checked.current = true;
    refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.account_id]);

  const setup = async () => {
    setBusy('setup');
    try {
      const url = await api.startPayoutSetup(societyId);
      if (url) await openProviderPage(url);
      await api.refreshPayoutAccount(societyId).catch(() => null);
      invalidate();
      q.refresh();
    } catch (e) {
      showAlert(t('Could not open the setup page'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const dashboard = async () => {
    setBusy('dashboard');
    try {
      const url = await api.payoutDashboardUrl(societyId);
      if (url) await openProviderPage(url);
      else showAlert(t('Payouts'), t('In the demo there is no payout dashboard to open.'));
    } catch (e) {
      showAlert(t('Could not open the dashboard'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (!q.data) return null;
  const fee = q.data.fee;
  const example = 200;
  const state = !account
    ? 'off'
    : account.charges_enabled
      ? 'on'
      : account.details_submitted && !account.requirements_due
        ? 'checking'
        : 'unfinished';

  return (
    <View style={[styles.card, { backgroundColor: c.card }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: '600', flex: 1 }}>{t('Online payments')}</Text>
        {state === 'on' && <Pill label={t('On')} tone="success" />}
        {state === 'checking' && <Pill label={t('Being checked')} tone="info" />}
        {state === 'unfinished' && <Pill label={t('Not finished')} tone="warning" />}
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 20 }}>
        {t('Buyers pay in the app by card, Apple Pay, Google Pay, Alipay or WeChat Pay. Orders are marked paid automatically.')}
      </Text>
      <View style={[styles.fee, { backgroundColor: c.fill }]}>
        <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>
          {t('Fee: {fee} per online order. On a {amount} order you receive {net}.', {
            fee: feeLabel(fee),
            amount: formatHkd(example),
            net: formatHkd(example - platformFeeHkd(example, fee)),
          })}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
          {t('Paid to your bank account every Friday. FPS, PayMe and cash stay free.')}
        </Text>
      </View>

      {state === 'off' && (
        <>
          <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {t(
              'Setup takes about 5 minutes on Stripe’s secure pages: the treasurer’s name, HKID and a Hong Kong bank account. The app never sees the ID.',
            )}
          </Text>
          <Button title={t('Set up online payments')} icon="card-outline" loading={busy === 'setup'} onPress={setup} />
        </>
      )}
      {state === 'unfinished' && (
        <>
          <Text style={{ color: c.warningText, fontSize: 14, lineHeight: 20 }}>
            {account?.requirements_due
              ? t('Stripe still needs {n} details before buyers can pay online.', { n: account.requirements_due })
              : t('Finish setup on Stripe’s pages before buyers can pay online.')}
          </Text>
          <Button title={t('Continue setup')} icon="card-outline" loading={busy === 'setup'} onPress={setup} />
        </>
      )}
      {state === 'checking' && (
        <>
          <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 20 }}>
            {t('Stripe is checking your details. This usually takes a few minutes, sometimes a day.')}
          </Text>
          <Button variant="secondary" title={t('Check again')} loading={busy === 'refresh'} onPress={() => refresh()} />
        </>
      )}
      {state === 'on' && (
        <Button
          variant="secondary"
          icon="open-outline"
          title={t('Payouts and bank account')}
          loading={busy === 'dashboard'}
          onPress={dashboard}
        />
      )}
      {retry && state !== 'on' && (
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('The setup link expired. Tap Continue setup to get a new one.')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  fee: { borderRadius: radius.md, padding: space.md, gap: 4 },
});
