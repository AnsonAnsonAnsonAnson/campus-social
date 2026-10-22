import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';

import { Button, Chip, ChipRow, Field } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COLLEGES } from '@/lib/constants';
import { space, useColors } from '@/lib/theme';

export default function EditProfile() {
  const c = useColors();
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [college, setCollege] = useState<string | null>(profile?.college ?? null);
  const [major, setMajor] = useState(profile?.major ?? '');
  const [year, setYear] = useState(profile?.year_of_study ? String(profile.year_of_study) : '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const y = parseInt(year, 10);
      await api.updateProfile({
        display_name: name.trim(),
        college,
        major: major.trim() || null,
        year_of_study: y >= 1 && y <= 8 ? y : null,
      });
      await refreshProfile();
      invalidate();
      router.back();
    } catch (e) {
      Alert.alert('Could not save', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <Field
          label="Display name"
          value={name}
          onChangeText={setName}
          maxLength={60}
          hint="Shown to society committees when you register."
        />
        <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600', textTransform: 'uppercase' }}>College</Text>
        <ChipRow>
          {COLLEGES.map((col) => (
            <Chip key={col} label={col} selected={college === col} onPress={() => setCollege(col === college ? null : col)} />
          ))}
        </ChipRow>
        <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: -8 }}>Your college's dates show up in the Calendar tab.</Text>
        <Field label="Major (optional)" value={major} onChangeText={setMajor} maxLength={80} />
        <Field label="Year of study (optional)" value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={1} />
        <Button title="Save" loading={busy} disabled={!name.trim()} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
