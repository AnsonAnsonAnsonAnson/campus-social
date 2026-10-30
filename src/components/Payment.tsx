import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { formatHkd, fpsPayload, parseFpsProxy } from '@/lib/fps';
import { radius, space, useColors } from '@/lib/theme';
import type { PaymentMethod, PaymentSettings } from '@/lib/types';
import { t } from '@/lib/i18n';

import { toast } from './Toast';
import { Button, Icon } from './ui';

/**
 * The shared payment step for member fees and shop orders. The app never holds
 * money: it shows the society's FPS QR (amount and reference filled in) and
 * PayMe link, and always the payee name, so a buyer can spot a wrong account.
 */
export function PaymentPanel({
  settings,
  amount,
  reference,
  method,
}: {
  settings: PaymentSettings | null;
  amount: number;
  reference: string;
  method: PaymentMethod | null;
}) {
  const c = useColors();
  const payload = settings?.fps_id ? fpsPayload({ proxy: settings.fps_id, amount, reference }) : null;
  const proxy = settings?.fps_id ? parseFpsProxy(settings.fps_id) : null;

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    toast(t('{what} copied', { what }), { icon: 'copy-outline' });
  };

  return (
    <View style={[styles.panel, { backgroundColor: c.card }]}>
      <View style={styles.amountRow}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600' }}>{t('Amount')}</Text>
          <Text style={[styles.amount, { color: c.text }]}>{formatHkd(amount)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600' }}>{t('Reference')}</Text>
          <Text style={[styles.ref, { color: c.text }]} selectable>
            {reference}
          </Text>
        </View>
      </View>
      <Button small variant="secondary" icon="copy-outline" title={t('Copy reference')} onPress={() => copy(reference, t('Reference'))} />

      {settings?.payee_name && (
        <View style={[styles.payee, { backgroundColor: c.fill }]}>
          <Icon name="shield-checkmark-outline" size={18} color={c.text} />
          <Text style={{ color: c.text, flex: 1, fontSize: 14, lineHeight: 20 }}>
            {t('Pay to {name}. Check the name in your bank app matches before you pay.', { name: settings.payee_name })}
          </Text>
        </View>
      )}

      {method === 'cash' ? (
        <Text style={{ color: c.textSecondary, fontSize: 15, lineHeight: 22 }}>
          {t('Pay in cash when you collect. The committee will mark it paid.')}
        </Text>
      ) : !settings || (!settings.fps_id && !settings.payme_link) ? (
        <Text style={{ color: c.warningText, fontSize: 15, lineHeight: 22 }}>
          {t('This society has not added its payment details yet. Ask the committee how to pay.')}
        </Text>
      ) : (
        <>
          {payload && (
            <View style={{ alignItems: 'center', gap: space.sm }}>
              <View style={styles.qr} accessible accessibilityLabel={t('FPS QR code with the amount and reference filled in')}>
                <QRCode value={payload} size={188} backgroundColor="#fff" color="#0A0A0B" />
              </View>
              <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>
                {t('Scan with your bank app (FPS). Some banks skip the reference: type it in if it is empty.')}
              </Text>
            </View>
          )}
          <View style={styles.buttons}>
            {settings.fps_id && (
              <Button
                small
                variant="secondary"
                icon="copy-outline"
                title={proxy?.kind === 'mobile' ? t('Copy FPS phone') : t('Copy FPS ID')}
                onPress={() => copy(settings.fps_id!, t('FPS ID'))}
              />
            )}
            {settings.payme_link && (
              <Button
                small
                variant="secondary"
                icon="open-outline"
                title={t('Open PayMe')}
                onPress={() => Linking.openURL(settings.payme_link!)}
              />
            )}
          </View>
        </>
      )}
      {!!settings?.instructions && <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 20 }}>{settings.instructions}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  amountRow: { flexDirection: 'row', alignItems: 'flex-end' },
  amount: { fontSize: 28, lineHeight: 34, fontWeight: '700', fontVariant: ['tabular-nums'] },
  ref: { fontSize: 20, lineHeight: 28, fontWeight: '600', letterSpacing: 1, fontVariant: ['tabular-nums'] },
  payee: { flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, borderRadius: radius.md },
  qr: { padding: 14, backgroundColor: '#fff', borderRadius: radius.md },
  buttons: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' },
});
