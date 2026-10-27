import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { PaymentPanel } from '@/components/Payment';
import { toast } from '@/components/Toast';
import { Banner, Button, ErrorView, Field, Loading, SegmentedControl } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { parseFpsProxy } from '@/lib/fps';
import { formatDay, formatTime } from '@/lib/format';
import { space, useColors } from '@/lib/theme';
import type { PaymentMethod } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

export default function PaymentSettingsScreen() {
  const { societyId } = useLocalSearchParams<{ societyId: string }>();
  const c = useColors();
  const q = useQuery(() => api.getPaymentSettings(societyId), [societyId]);

  const [fps, setFps] = useState('');
  const [payee, setPayee] = useState('');
  const [payme, setPayme] = useState('');
  const [instructions, setInstructions] = useState('');
  const [preview, setPreview] = useState<PaymentMethod>('fps');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = q.data;
    if (!s) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setFps(s.fps_id ?? '');
    setPayee(s.payee_name ?? '');
    setPayme(s.payme_link ?? '');
    setInstructions(s.instructions ?? '');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [q.data]);

  if (q.loading && q.data === undefined) return <Loading />;
  if (q.error && q.data === undefined) return <ErrorView message={q.error} onRetry={q.refresh} />;

  const proxy = fps.trim() ? parseFpsProxy(fps) : null;
  const fpsError = fps.trim() && !proxy ? t('Use a Hong Kong mobile number, an email, or a 7 to 9 digit FPS ID') : null;
  const paymeError =
    payme.trim() && !/^https:\/\/(payme\.hsbc\/|payme\.hsbc\.com\.hk\/)\S+$/i.test(payme.trim())
      ? t('Paste your PayMe link, starting https://payme.hsbc/')
      : null;
  const payeeError = fps.trim() && !payee.trim() ? t('Buyers check this name in their bank app before paying') : null;
  const valid = !fpsError && !paymeError && !payeeError;
  const changed =
    fps.trim() !== (q.data?.fps_id ?? '') ||
    payee.trim() !== (q.data?.payee_name ?? '') ||
    payme.trim() !== (q.data?.payme_link ?? '') ||
    instructions.trim() !== (q.data?.instructions ?? '');

  const save = async () => {
    // Changing where money goes is the riskiest edit a committee can make.
    if (q.data?.fps_id && q.data.fps_id !== fps.trim()) {
      const ok = await confirmAsync(
        t('Change where buyers pay?'),
        t('The other admins are notified. Orders already placed keep showing the new details, so tell anyone mid-payment.'),
        t('Change'),
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await api.setPaymentSettings(societyId, {
        fps_id: fps.trim() || null,
        payee_name: payee.trim() || null,
        payme_link: payme.trim() || null,
        instructions: instructions.trim() || null,
      });
      invalidate();
      router.back();
      toast(t('Payment details saved'));
    } catch (e) {
      showAlert(t('Could not save'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const draft = {
    society_id: societyId,
    fps_id: proxy ? fps.trim() : null,
    payee_name: payee.trim() || null,
    payme_link: paymeError ? null : payme.trim() || null,
    instructions: instructions.trim() || null,
    updated_at: new Date().toISOString(),
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Banner
          icon="shield-checkmark-outline"
          text={t(
            'Buyers pay your society account directly. The app never touches the money, and every change here is sent to all your admins.',
          )}
        />
        <Field
          label={t('FPS ID, mobile or email')}
          value={fps}
          onChangeText={setFps}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="9123 4567"
          error={fpsError}
          valid={!!proxy}
          hint={
            proxy
              ? t('Recognised as {kind}', {
                  kind: proxy.kind === 'mobile' ? t('a mobile number') : proxy.kind === 'email' ? t('an email') : t('an FPS ID'),
                })
              : undefined
          }
        />
        <Field
          label={t('Account name')}
          value={payee}
          onChangeText={setPayee}
          placeholder={t('As the bank app shows it, e.g. CHAN T** M**')}
          error={payeeError}
          maxLength={80}
        />
        <Field
          label={t('PayMe link (optional)')}
          value={payme}
          onChangeText={setPayme}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://payme.hsbc/yoursociety"
          error={paymeError}
        />
        <Field
          label={t('Cash and other notes (optional)')}
          value={instructions}
          onChangeText={setInstructions}
          multiline
          maxLength={500}
          placeholder={t('e.g. Pay cash at our booth, Tue 12–2pm outside the Library')}
        />

        <View style={{ gap: space.sm }}>
          <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600' }}>{t('What buyers see')}</Text>
          <SegmentedControl
            grey
            value={preview}
            onChange={setPreview}
            options={[
              { value: 'fps', label: 'FPS' },
              { value: 'payme', label: 'PayMe' },
              { value: 'cash', label: t('Cash') },
            ]}
          />
          <PaymentPanel settings={draft} amount={120} reference="SSM-1234" method={preview} />
          <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {t('Test it once: scan the QR with your own bank app and check the name and amount, then cancel.')}
          </Text>
        </View>

        <Button title={t('Save')} loading={busy} disabled={!valid || !changed} onPress={save} />
        {q.data?.updated_at && (
          <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>
            {t('Last changed {when}', { when: `${formatDay(q.data.updated_at)} ${formatTime(q.data.updated_at)}` })}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
