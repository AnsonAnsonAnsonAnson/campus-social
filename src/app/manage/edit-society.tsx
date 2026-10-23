import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { toast } from '@/components/Toast';
import { Artwork, Button, Chip, ChipRow, ErrorView, Field, Icon, Loading, SocietyAvatar } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import type { SocietyPatch } from '@/lib/backend';
import { COLLEGES, SOCIETY_CATEGORIES } from '@/lib/constants';
import { showAlert } from '@/lib/dialog';
import { pickAndUploadImage } from '@/lib/pickImage';
import { radius, space, type, useColors } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Form = Required<{ [K in keyof SocietyPatch]: string }>;

const EMPTY: Form = {
  name: '',
  short_name: '',
  description: '',
  category: 'Other',
  college: '',
  logo_url: '',
  cover_url: '',
  instagram: '',
  website: '',
  contact_email: '',
};

export default function EditSociety() {
  const { societyId } = useLocalSearchParams<{ societyId: string }>();
  const c = useColors();
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);

  useEffect(() => {
    api
      .getSociety(societyId)
      .then((s) => {
        if (!s) throw new Error(t("You don't have access to this society."));
        const f = { ...EMPTY };
        for (const k of Object.keys(EMPTY) as (keyof Form)[]) f[k] = (s[k] as string | null) ?? '';
        setForm(f);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [societyId]);

  if (error) return <ErrorView message={error} />;
  if (!form) return <Loading />;

  const set = (k: keyof Form) => (v: string) => setForm((f) => f && { ...f, [k]: v });

  const upload = async (kind: 'logo' | 'cover') => {
    setUploading(kind);
    try {
      const url = await pickAndUploadImage(kind === 'logo' ? [1, 1] : [3, 1]);
      if (url) set(kind === 'logo' ? 'logo_url' : 'cover_url')(url);
    } catch (e) {
      showAlert(t('Could not upload image'), errorMessage(e));
    } finally {
      setUploading(null);
    }
  };

  const website = form.website.trim();
  const websiteOk = !website || /^https?:\/\/\S+\.\S+/i.test(website);
  const emailOk = !form.contact_email.trim() || /^\S+@\S+\.\S+$/.test(form.contact_email.trim());
  const valid = form.name.trim().length >= 2 && websiteOk && emailOk;

  const save = async () => {
    setBusy(true);
    try {
      const patch: SocietyPatch = {
        name: form.name.trim(),
        short_name: form.short_name.trim() || null,
        description: form.description.trim(),
        category: form.category,
        college: form.college || null,
        logo_url: form.logo_url || null,
        cover_url: form.cover_url || null,
        instagram: form.instagram.trim().replace(/^@?/, '@').replace(/^@$/, '') || null,
        website: website || null,
        contact_email: form.contact_email.trim() || null,
      };
      await api.updateSociety(societyId, patch);
      invalidate();
      router.back();
      toast(t('Society updated'));
    } catch (e) {
      showAlert(t('Could not save'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => upload('cover')} accessibilityLabel={t('Change cover image')} disabled={!!uploading}>
          <Artwork seed={societyId} uri={form.cover_url || null} style={styles.cover}>
            <View style={styles.hint}>
              <Icon name="image-outline" color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600' }}>{uploading === 'cover' ? t('Uploading…') : t('Change cover')}</Text>
            </View>
          </Artwork>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <SocietyAvatar name={form.name || 'Society'} uri={form.logo_url || null} size={64} />
          <Button
            small
            variant="secondary"
            title={uploading === 'logo' ? t('Uploading…') : t('Change logo')}
            disabled={!!uploading}
            onPress={() => upload('logo')}
          />
        </View>

        <Field label={t('Society name')} value={form.name} onChangeText={set('name')} maxLength={120} />
        <Field
          label={t('Short name')}
          value={form.short_name}
          onChangeText={set('short_name')}
          maxLength={30}
          hint={t('Shown on event cards.')}
        />
        <Field
          label={t('About')}
          value={form.description}
          onChangeText={set('description')}
          multiline
          maxLength={1000}
          placeholder={t('What does your society do? When do you meet?')}
        />

        <Text style={[type.overline, { color: c.textSecondary, marginBottom: -8 }]}>{t('Category')}</Text>
        <ChipRow>
          {SOCIETY_CATEGORIES.map((cat) => (
            <Chip key={cat} label={t(cat)} selected={form.category === cat} onPress={() => set('category')(cat)} />
          ))}
        </ChipRow>
        <Text style={[type.overline, { color: c.textSecondary, marginBottom: -8 }]}>{t('College')}</Text>
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
          label={t('Website')}
          value={form.website}
          onChangeText={set('website')}
          placeholder="https://"
          autoCapitalize="none"
          keyboardType="url"
          hint={websiteOk ? undefined : t('Start with https://')}
        />
        <Field
          label={t('Contact email')}
          value={form.contact_email}
          onChangeText={set('contact_email')}
          keyboardType="email-address"
          autoCapitalize="none"
          hint={emailOk ? undefined : t('Check the email address')}
        />
        <Button title={t('Save')} loading={busy} disabled={!valid || !!uploading} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  cover: { height: 130, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  hint: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
});
