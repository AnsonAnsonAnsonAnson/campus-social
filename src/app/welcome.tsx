import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Skeleton } from '@/components/Skeleton';
import { SocietyRow } from '@/components/SocietyRow';
import { Button, Chip, Field, Icon } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COLLEGES, SOCIETY_CATEGORIES } from '@/lib/constants';
import { showAlert } from '@/lib/dialog';
import { markOnboarded } from '@/lib/onboarding';
import { space, textStyle, type, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { changeLanguage, t, useLang } from '@/lib/i18n';

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
  const [noCollege, setNoCollege] = useState(false);
  const [busy, setBusy] = useState(false);
  const lang = useLang();
  const insets = useSafeAreaInsets();

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

  const next = step === 1 ? () => setStep(2) : () => finish(true);
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.backgroundPlain }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.top, { paddingTop: Math.max(insets.top, space.md) }]}>
        {step === 2 && (
          <Pressable
            onPress={() => setStep(1)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('Back')}
            style={{ marginLeft: -6 }}>
            <Icon name="chevron-back" size={22} color={c.text} />
          </Pressable>
        )}
        <View style={{ flexDirection: 'row', gap: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {[1, 2].map((n) => (
            <View key={n} style={[styles.stepBar, { backgroundColor: n <= step ? c.brand : c.border }]} />
          ))}
        </View>
        <Text style={{ flex: 1, fontSize: 13, color: c.textSecondary }}>{t('Step {n} of {total}', { n: step, total: 2 })}</Text>
        <Pressable
          onPress={() => changeLanguage(lang === 'en' ? 'zh-Hant' : 'en', '/welcome')}
          accessibilityRole="button"
          accessibilityLabel={t('Language')}
          style={styles.topLink}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: c.textSecondary }}>{lang === 'en' ? '中文' : 'English'}</Text>
        </Pressable>
        <Pressable onPress={() => finish(false)} accessibilityRole="button" style={styles.topLink}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: c.textSecondary }}>{t('Skip')}</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: 14, paddingBottom: space.xl, gap: 22 }}
        keyboardShouldPersistTaps="handled">
        {step === 1 ? (
          <>
            <View style={{ gap: 10 }}>
              <View style={[styles.appIcon, { backgroundColor: c.brand }]}>
                <Icon name="ticket-outline" size={28} color={c.onBrand} />
              </View>
              <Text style={[textStyle('title1', lang), { color: c.text, marginTop: 4, letterSpacing: -0.3 }]} accessibilityRole="header">
                {t('Welcome to Campus Social')}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 16, lineHeight: 24 }}>
                {t('Follow societies, sign up in one tap, keep your tickets on your phone. First, tell us who you are.')}
              </Text>
            </View>
            <Field
              label={t('What should we call you?')}
              value={name}
              onChangeText={setName}
              maxLength={60}
              autoComplete="name"
              textContentType="name"
              placeholder={t('e.g. Chan Tai Man')}
              hint={t('Committees see this when you sign up for events.')}
            />
            <View style={{ gap: space.sm }}>
              <Text style={[type.label, { color: c.textSecondary }]}>{t('Which college are you in?')}</Text>
              <View style={styles.wrap} accessibilityRole="radiogroup">
                {[...COLLEGES, 'none' as const].map((col) => {
                  const value = col === 'none' ? null : col;
                  return (
                    <Chip
                      key={col}
                      label={col === 'none' ? t('Not applicable') : t(col)}
                      selected={college === value && (value !== null || noCollege)}
                      onPress={() => {
                        setNoCollege(value === null);
                        setCollege(value);
                      }}
                    />
                  );
                })}
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={{ gap: space.sm }}>
              <Text style={[textStyle('title1', lang), { color: c.text, letterSpacing: -0.3 }]} accessibilityRole="header">
                {t('What are you into?')}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 16, lineHeight: 24 }}>
                {t('Pick a few and we’ll suggest societies you’ll like.')}
              </Text>
            </View>
            <View style={styles.wrap}>
              {SOCIETY_CATEGORIES.map((cat) => (
                <Chip
                  key={cat}
                  label={t(cat)}
                  icon={interests.has(cat) ? 'checkmark' : undefined}
                  selected={interests.has(cat)}
                  onPress={() => toggleInterest(cat)}
                />
              ))}
            </View>

            <View>
              <Text style={[textStyle('title2', lang), { color: c.text, marginBottom: 4 }]} accessibilityRole="header">
                {t('Suggested societies')}
              </Text>
              <View style={{ marginHorizontal: -space.lg }}>
                {societies.loading && !societies.data
                  ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={64} round={0} style={{ marginBottom: 1 }} />)
                  : suggestions.map((s, i) => (
                      <View key={s.id}>
                        {i > 0 && <View style={[styles.rule, { backgroundColor: c.border }]} />}
                        <SocietyRow society={s} />
                      </View>
                    ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, space.lg), borderTopColor: step === 2 ? c.border : 'transparent' },
        ]}>
        <Button
          title={step === 1 ? t('Continue') : followIds.size ? t('Done · following {n}', { n: followIds.size }) : t('Done')}
          loading={busy}
          disabled={step === 1 && !name.trim()}
          hint={step === 1 ? t('Add your name to continue') : undefined}
          onPress={next}
          style={{ alignSelf: 'stretch' }}
        />
        {step === 1 && <Text style={{ fontSize: 13, color: c.textTertiary }}>{t('You can change all of this later in Profile')}</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.lg, minHeight: 44 },
  topLink: { minHeight: 44, justifyContent: 'center' },
  stepBar: { width: 36, height: 4, borderRadius: 2 },
  appIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  rule: { height: StyleSheet.hairlineWidth, marginLeft: 76 },
  footer: { gap: 10, alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
});
