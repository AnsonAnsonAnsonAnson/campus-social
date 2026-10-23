import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { Skeleton } from '@/components/Skeleton';
import { SocietyRow } from '@/components/SocietyRow';
import { Button, Chip, ChipRow, Field } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COLLEGES, SOCIETY_CATEGORIES } from '@/lib/constants';
import { showAlert } from '@/lib/dialog';
import { markOnboarded } from '@/lib/onboarding';
import { radius, space, type, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { changeLanguage, LANGUAGES, t, useLang } from '@/lib/i18n';

/** First-run setup: name, college and a few societies to follow, so Discover has something personal from day one. */
export default function Welcome() {
  const c = useColors();
  const { profile, user, refreshProfile, followIds } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? user?.email.split('@')[0] ?? '');
  const [college, setCollege] = useState<string | null>(profile?.college ?? null);
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const lang = useLang();

  const societies = useQuery(() => api.listSocieties({}));

  const suggestions = useMemo(() => {
    const score = (s: { category: string; college: string | null; follower_count: number }) =>
      (interests.has(s.category) ? 2000 : 0) + (college && s.college === college ? 1000 : 0) + Math.min(s.follower_count, 999);
    return [...(societies.data ?? [])].sort((a, b) => score(b) - score(a)).slice(0, 6);
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
      <ScrollView
        contentContainerStyle={{ paddingVertical: space.lg, gap: space.lg, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled">
        <ChipRow>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} label={l.label} selected={lang === l.code} onPress={() => changeLanguage(l.code, '/welcome')} />
          ))}
        </ChipRow>

        <View style={{ paddingHorizontal: space.lg, gap: space.xs }}>
          <Text style={[type.largeTitle, { color: c.text }]}>{t('Welcome to Campus Social')}</Text>
          <Text style={[type.subhead, { color: c.textSecondary, lineHeight: 21 }]}>
            {t('Three quick things and your feed will be all about what you’re into.')}
          </Text>
        </View>

        <View style={{ paddingHorizontal: space.lg }}>
          <Field
            label={t('Your name')}
            value={name}
            onChangeText={setName}
            maxLength={60}
            hint={t('Committees see this when you sign up for events.')}
          />
        </View>

        <Text style={[type.overline, { color: c.textSecondary, marginHorizontal: space.lg, marginBottom: -8 }]}>{t('Your college')}</Text>
        <ChipRow>
          {COLLEGES.map((col) => (
            <Chip key={col} label={t(col)} selected={college === col} onPress={() => setCollege(col === college ? null : col)} />
          ))}
        </ChipRow>

        <Text style={[type.overline, { color: c.textSecondary, marginHorizontal: space.lg, marginBottom: -8 }]}>
          {t('What are you into?')}
        </Text>
        <ChipRow>
          {SOCIETY_CATEGORIES.filter((cat) => cat !== 'Other').map((cat) => (
            <Chip key={cat} label={t(cat)} selected={interests.has(cat)} onPress={() => toggleInterest(cat)} />
          ))}
        </ChipRow>

        <View style={{ gap: space.sm }}>
          <Text style={[type.overline, { color: c.textSecondary, marginHorizontal: space.lg }]}>
            {t('Societies to follow')} {followIds.size ? `· ${t('{n} following', { n: followIds.size })}` : ''}
          </Text>
          <View style={{ marginHorizontal: space.lg, borderRadius: radius.md, overflow: 'hidden' }}>
            {societies.loading && !societies.data
              ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={64} round={0} style={{ marginBottom: 1 }} />)
              : suggestions.map((s) => <SocietyRow key={s.id} society={s} />)}
          </View>
        </View>

        <View style={{ paddingHorizontal: space.lg }}>
          <Button title={t('Done')} loading={busy} disabled={!name.trim()} onPress={() => finish(true)} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
