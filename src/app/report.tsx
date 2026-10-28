import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { toast } from '@/components/Toast';
import { Button, Chip, ChipRow, Field } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { space, useColors } from '@/lib/theme';
import type { ReportTarget } from '@/lib/types';
import { showAlert } from '@/lib/dialog';
import { t } from '@/lib/i18n';

// Stored in English so moderators see the same reasons whatever the reporter's language.
const REASONS = ['Spam or scam', 'Inappropriate content', 'Impersonation', 'Unsafe event', 'Other'];

export default function Report() {
  const c = useColors();
  const { type, id, name } = useLocalSearchParams<{ type: ReportTarget; id: string; name?: string }>();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.report(type, id, [reason, details.trim()].filter(Boolean).join(': '));
      router.back();
      toast(t('Thanks. Our team reviews every report within 24 hours.'));
    } catch (e) {
      showAlert(t('Could not send report'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
      <Text style={{ color: c.text, fontSize: 17, fontWeight: '600' }}>
        {name ? t('What’s wrong with “{name}”?', { name }) : t('What’s wrong with this {type}?', { type: t(type) })}
      </Text>
      <ChipRow>
        {REASONS.map((r) => (
          <Chip key={r} label={t(r)} selected={reason === r} onPress={() => setReason(r)} />
        ))}
      </ChipRow>
      <Field label={t('Details (optional)')} value={details} onChangeText={setDetails} multiline maxLength={900} />
      <Button title={t('Send report')} variant="destructive" loading={busy} disabled={!reason} onPress={submit} />
    </ScrollView>
  );
}
