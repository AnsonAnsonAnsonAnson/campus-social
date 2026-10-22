import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';

import { Button, Card, Chip, ChipRow, Field } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { COLLEGES, SOCIETY_CATEGORIES } from '@/lib/constants';
import { space, useColors } from '@/lib/theme';

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
      Alert.alert('Submitted for review', 'You can set up events now. Your society becomes public once the app team verifies it.');
    } catch (e) {
      Alert.alert('Could not register society', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={{ color: c.textSecondary, lineHeight: 20 }}>
            Registered societies get a profile students can follow, can post events with sign-ups, and can request promotional banners. Each
            society is checked by the app team before it goes public, so please use your official name.
          </Text>
        </Card>
        <Field label="Society name" value={form.name} onChangeText={set('name')} placeholder="CUHK Hiking Club" maxLength={120} />
        <Field label="Short name" value={form.short_name} onChangeText={set('short_name')} placeholder="Hiking" maxLength={30} />
        <Field
          label="About"
          value={form.description}
          onChangeText={set('description')}
          multiline
          maxLength={1000}
          placeholder="What does your society do?"
        />
        <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600', textTransform: 'uppercase' }}>Category</Text>
        <ChipRow>
          {SOCIETY_CATEGORIES.map((cat) => (
            <Chip key={cat} label={cat} selected={form.category === cat} onPress={() => set('category')(cat)} />
          ))}
        </ChipRow>
        <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600', textTransform: 'uppercase' }}>
          College (if college-based)
        </Text>
        <ChipRow>
          {COLLEGES.map((col) => (
            <Chip key={col} label={col} selected={form.college === col} onPress={() => set('college')(form.college === col ? '' : col)} />
          ))}
        </ChipRow>
        <Field label="Instagram" value={form.instagram} onChangeText={set('instagram')} placeholder="@yoursociety" autoCapitalize="none" />
        <Field
          label="Contact email"
          value={form.contact_email}
          onChangeText={set('contact_email')}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Button title="Submit for review" loading={busy} disabled={form.name.trim().length < 2} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
