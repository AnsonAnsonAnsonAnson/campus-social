import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';

import { toast } from '@/components/Toast';
import { Button, Card, Chip, ChipRow, Field } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { COLLEGES, SOCIETY_CATEGORIES } from '@/lib/constants';
import { space, useColors } from '@/lib/theme';
import { showAlert } from '@/lib/dialog';
import { t } from '@/lib/i18n';

export default function NewSociety() {
  const c = useColors();
  const [form, setForm] = useState({
    name: '',
    short_name: '',
    description: '',
    category: 'Other',
    college: '',
    instagram: '',
    contact_email: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      const id = await api.createSociety(form);
      invalidate();
      router.replace(`/manage/${id}`);
      toast(t('Submitted for review. You can set up events now.'));
    } catch (e) {
      showAlert(t('Could not register society'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={{ color: c.textSecondary, lineHeight: 20 }}>
            {t(
              'Registered societies get a profile students can follow, can post events with sign-ups, and can request promotional banners. Each society is checked by the app team before it goes public, so please use your official name.',
            )}
          </Text>
        </Card>
        <Field label={t('Society name')} value={form.name} onChangeText={set('name')} placeholder={t('CUHK Hiking Club')} maxLength={120} />
        <Field label={t('Short name')} value={form.short_name} onChangeText={set('short_name')} placeholder={t('Hiking')} maxLength={30} />
        <Field
          label={t('About')}
          value={form.description}
          onChangeText={set('description')}
          multiline
          maxLength={1000}
          placeholder={t('What does your society do?')}
        />
        <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600', textTransform: 'uppercase' }}>{t('Category')}</Text>
        <ChipRow>
          {SOCIETY_CATEGORIES.map((cat) => (
            <Chip key={cat} label={t(cat)} selected={form.category === cat} onPress={() => set('category')(cat)} />
          ))}
        </ChipRow>
        <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600', textTransform: 'uppercase' }}>
          {t('College (if college-based)')}
        </Text>
        <ChipRow>
          {COLLEGES.map((col) => (
            <Chip
              key={col}
              label={t(col)}
              selected={form.college === col}
              onPress={() => set('college')(form.college === col ? '' : col)}
            />
          ))}
        </ChipRow>
        <Field
          label={t('Instagram')}
          value={form.instagram}
          onChangeText={set('instagram')}
          placeholder="@yoursociety"
          autoCapitalize="none"
        />
        <Field
          label={t('Contact email')}
          value={form.contact_email}
          onChangeText={set('contact_email')}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Button title={t('Submit for review')} loading={busy} disabled={form.name.trim().length < 2} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
