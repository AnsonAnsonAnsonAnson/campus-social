import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { Skeleton } from '@/components/Skeleton';
import { SocietyRow } from '@/components/SocietyRow';
import { Button, Chip, ChipRow, Field, ProgressBar } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COLLEGES, SOCIETY_CATEGORIES } from '@/lib/constants';
import { showAlert } from '@/lib/dialog';
import { markOnboarded } from '@/lib/onboarding';
import { radius, space, textStyle, type, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { changeLanguage, LANGUAGES, t, useLang } from '@/lib/i18n';

/**
 * First-run setup in two steps: who you are (name, college), then what you're
 * into (interests, a few societies to follow), so Discover is personal from day one.
 */
export default function Welcome() {
  const c = useColors();
  const { profile, refreshProfile, followIds } = useAuth();
  // Never prefill from the email: for students that's their student ID, not a name.
  const [name, setName] = useState(profile?.display_name ?? '');
  const [step, setStep] = useState<1 | 2>(1);
  const [college, setCollege] = useState<string | null>(profile?.college ?? null);
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const lang = useLang();

  const societies = useQuery(() => api.listSocieties({}));

  const suggestions = useMemo(() => {
    const score = (s: { category: string; college: string | null; follower_count: number }) =>
      (interests.has(s.category) ? 2000 : 0) + (college && s.college === college ? 1000 : 0) + Math.min(s.follower_count, 999);
    return [...(societies.data ?? [])].sort((a, b) => score(b) - score(a)).slice(0, 4);
  }, [societies.data, interests, college]);

  const toggleInterest = (cat: string) =>
    setInterests((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  const finish = async (save: boolean) => {
    setBusy(true);
    try {
      if (save) {
        await api.updateProfile({ display_name: name.trim() || undefined, college });
        await refreshProfile();
      }
      await markOnboarded();
      invalidate();
      if (router.canGoBack()) router.back();
      else router.replace('/discover');
    } catch (e) {
      showAlert(t('Could not save'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => finish(false)} hitSlop={10} accessibilityRole="button">
              <Text style={{ color: c.tint, fontSize: 17 }}>{t('Skip')}</Text>
            </Pressable>
          ),
        }}
      />
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <ProgressBar value={step / 2} />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingVertical: space.lg, gap: space.lg, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled">
        {step === 1 ? (
          <>
            <ChipRow>
              {LANGUAGES.map((l) => (
                <Chip key={l.code} label={l.label} selected={lang === l.code} onPress={() => changeLanguage(l.code, '/welcome')} />
              ))}
            </ChipRow>

            <View style={{ paddingHorizontal: space.lg, gap: space.xs }}>
              <Text style={[textStyle('largeTitle', lang), { color: c.text }]}>{t('Welcome to Campus Social')}</Text>
              <Text style={[type.subhead, { color: c.textSecondary, lineHeight: 21 }]}>{t('First, tell committees who you are.')}</Text>
            </View>

            <View style={{ paddingHorizontal: space.lg }}>
              <Field
                label={t('Your name')}
                value={name}
                onChangeText={setName}
                maxLength={60}
                autoComplete="name"
                textContentType="name"
                placeholder={t('e.g. Chan Tai Man')}
                hint={t('Committees see this when you sign up for events.')}
              />
            </View>

            <Text style={[type.overline, { color: c.textSecondary, marginHorizontal: space.lg, marginBottom: -8 }]}>{t('Your college')}</Text>
            <ChipRow>
              {COLLEGES.map((col) => (
                <Chip key={col} label={t(col)} selected={college === col} onPress={() => setCollege(col === college ? null : col)} />
              ))}
            </ChipRow>

            <View style={{ paddingHorizontal: space.lg }}>
              <Button title={t('Next')} disabled={!name.trim()} hint={t('Add your name to continue')} onPress={() => setStep(2)} />
            </View>
          </>
        ) : (
          <>
            <View style={{ paddingHorizontal: space.lg, gap: space.xs }}>
              <Text style={[textStyle('largeTitle', lang), { color: c.text }]}>{t('What are you into?')}</Text>
              <Text style={[type.subhead, { color: c.textSecondary, lineHeight: 21 }]}>
                {t('Pick a few and we’ll suggest societies to follow.')}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.lg }}>
              {SOCIETY_CATEGORIES.filter((cat) => cat !== 'Other').map((cat) => (
                <Chip
                  key={cat}
                  label={t(cat)}
                  icon={interests.has(cat) ? 'checkmark' : undefined}
                  selected={interests.has(cat)}
                  onPress={() => toggleInterest(cat)}
                />
              ))}
            </View>

            <View style={{ gap: space.sm }}>
              <Text style={[type.overline, { color: c.textSecondary, marginHorizontal: space.lg }]}>{t('Societies to follow')}</Text>
              <View style={{ marginHorizontal: space.lg, borderRadius: radius.md, overflow: 'hidden' }}>
                {societies.loading && !societies.data
                  ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={64} round={0} style={{ marginBottom: 1 }} />)
                  : suggestions.map((s) => <SocietyRow key={s.id} society={s} />)}
              </View>
            </View>

            <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
              <Button
                title={followIds.size ? t('Done · following {n}', { n: followIds.size }) : t('Done')}
                loading={busy}
                onPress={() => finish(true)}
              />
              <Button title={t('Back')} variant="plain" disabled={busy} onPress={() => setStep(1)} />
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
