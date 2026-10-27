// Optional payment screenshots: the payer adds one, the treasurer looks at it.
import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toast } from '@/components/Toast';
import { Button, Icon } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { showAlert } from '@/lib/dialog';
import { formatWhen } from '@/lib/format';
import { pickReceipt } from '@/lib/receipts';
import { radius, space, useColors } from '@/lib/theme';
import type { ReceiptKind } from '@/lib/types';
import { t } from '@/lib/i18n';

/** "Add payment screenshot": compresses on the phone, uploads, and counts as "I've paid". */
export function ReceiptUpload({
  kind,
  record,
}: {
  kind: ReceiptKind;
  record: { id: string; society_id: string; receipt_at: string | null };
}) {
  const c = useColors();
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      const picked = await pickReceipt();
      if (!picked) return;
      await api.uploadReceipt(kind, record, picked.uri);
      invalidate();
      toast(t('Screenshot sent. The treasurer will check and confirm.'), { icon: 'image-outline' });
    } catch (e) {
      showAlert(t('Could not upload image'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.box, { borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <Icon name={record.receipt_at ? 'checkmark-circle' : 'image-outline'} size={20} color={record.receipt_at ? c.success : c.text} />
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', flex: 1 }}>
          {record.receipt_at ? t('Screenshot sent {when}', { when: formatWhen(record.receipt_at) }) : t('Payment screenshot (optional)')}
        </Text>
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
        {t(
          'Helps the treasurer find your payment. It is shrunk on your phone first, only the society’s admins can see it, and it is deleted after your payment is confirmed.',
        )}
      </Text>
      <Button
        small
        variant="secondary"
        icon="image-outline"
        loading={busy}
        title={record.receipt_at ? t('Replace screenshot') : t('Add screenshot')}
        onPress={add}
      />
    </View>
  );
}

/** Committee: "View screenshot" opens it full screen through a short-lived link. */
export function ReceiptButton({ path, at }: { path: string | null; at: string | null }) {
  const c = useColors();
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!at) return null;
  if (!path)
    return (
      <Text style={{ color: c.textSecondary, fontSize: 13 }}>
        {t('Screenshot deleted after the payment was settled ({when})', { when: formatWhen(at) })}
      </Text>
    );
  const open = async () => {
    setBusy(true);
    try {
      setUri(await api.receiptUrl(path));
    } catch (e) {
      showAlert(t('Something went wrong'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="secondary" icon="image-outline" loading={busy} title={t('View payment screenshot')} onPress={open} />
      <ReceiptViewer uri={uri} onClose={() => setUri(null)} />
    </>
  );
}

function ReceiptViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  return (
    <Modal visible={!!uri} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.viewer}>
        {uri && (
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            onLoadEnd={() => setLoading(false)}
            accessibilityLabel={t('Payment screenshot')}
          />
        )}
        {loading && <ActivityIndicator color="#fff" />}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('Close')}
          hitSlop={12}
          style={[styles.close, { top: insets.top + space.md }]}>
          <Icon name="close" size={22} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2, borderStyle: 'dashed' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  close: {
    position: 'absolute',
    right: space.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
