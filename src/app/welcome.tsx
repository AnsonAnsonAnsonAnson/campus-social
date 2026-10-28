import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Skeleton } from '@/components/Skeleton';
import { FollowButton } from '@/components/SocietyRow';
import { Button, Chip, Field, Icon, SocietyAvatar, tap } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COLLEGES, SOCIETY_CATEGORIES } from '@/lib/constants';
import { showAlert } from '@/lib/dialog';
import { markOnboarded } from '@/lib/onboarding';
import { recommendSocieties, type Suggestion } from '@/lib/recommend';
import { avatarArt, SOCIETY_ICONS, societyFamily, space, textStyle, type, useColors, useIsDark } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { changeLanguage, t, useLang } from '@/lib/i18n';

/** What each interest tile covers, so a pick means something before you know the societies. */
const INTEREST_EXAMPLES: Record<string, string> = {
  Academic: 'Debate, finance, research',
  Arts: 'Drama, film, photography',
  Culture: 'Languages, exchange, heritage',
  Faith: 'Fellowships and faith groups',
  Music: 'Bands, choirs, a cappella',
  Service: 'Volunteering, social causes',
  Sports: 'Hiking, ball games, dance',
  Tech: 'Coding, robotics, startups',
  College: 'Hall and college life',
  Other: 'Everything else',
};

const STEPS = 3;

/**
 * First-run setup, like a music or video app's taste picker, in three steps:
 * who you are (name, college), what you're into (interest tiles), then societies
 * picked from those to follow in one tap, so Discover is personal from day one.
 */
export default function Welcome() {
  const c = useColors();
  const { profile, refreshProfile, followIds, toggleFollow } = useAuth();
  // Never prefill from the email: for students that's their student ID, not a name.
  const [name, setName] = useState(profile?.display_name ?? '');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [college, setCollege] = useState<string | null>(profile?.college ?? null);
  const [interests, setInterests] = useState<Set<string>>(new Set(profile?.interests ?? []));
  const [noCollege, setNoCollege] = useState(false);
  const [busy, setBusy] = useState(false);
  const lang = useLang();
  const insets = useSafeAreaInsets();

  const societies = useQuery(() => api.listSocieties({}));

  // Worked out when you reach step 3, not on every follow, so rows don't jump as you tap.
  const suggestions = useMemo(
    () => (step === 3 ? recommendSocieties(societies.data ?? [], { interests, college }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [societies.data, step],
  );
  const notFollowed = suggestions.filter((s) => !followIds.has(s.society.id));
  const followAll = () => {
    tap();
    Promise.all(notFollowed.map((s) => toggleFollow(s.society.id))).catch((e) => showAlert(t('Could not update'), errorMessage(e)));
  };

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
        await api.updateProfile({
          display_name: name.trim() || undefined,
          college,
          interests: SOCIETY_CATEGORIES.filter((cat) => interests.has(cat)),
        });
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

  const next = step < STEPS ? () => setStep((step + 1) as 2 | 3) : () => finish(true);
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.backgroundPlain }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.top, { paddingTop: Math.max(insets.top, space.md) }]}>
        {step > 1 && (
          <Pressable
            onPress={() => setStep((step - 1) as 1 | 2)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('Back')}
            style={{ marginLeft: -6 }}>
            <Icon name="chevron-back" size={22} color={c.text} />
          </Pressable>
        )}
        <View style={{ flexDirection: 'row', gap: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: STEPS }, (_, i) => i + 1).map((n) => (
            <View key={n} style={[styles.stepBar, { backgroundColor: n <= step ? c.tint : c.border }]} />
          ))}
        </View>
        <Text style={{ flex: 1, fontSize: 13, color: c.textSecondary }}>{t('Step {n} of {total}', { n: step, total: STEPS })}</Text>
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
              <View style={[styles.appIcon, { backgroundColor: c.tint }]}>
                <Icon name="ticket-outline" size={28} color="#FFFFFF" />
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
        ) : step === 2 ? (
          <>
            <View style={{ gap: space.sm }}>
              <Text style={[textStyle('title1', lang), { color: c.text, letterSpacing: -0.3 }]} accessibilityRole="header">
                {t('What are you into?')}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 16, lineHeight: 24 }}>
                {t('Pick as many as you like. We’ll suggest societies to follow.')}
              </Text>
            </View>
            <View style={styles.grid}>
              {SOCIETY_CATEGORIES.map((cat) => (
                <InterestTile key={cat} category={cat} selected={interests.has(cat)} onPress={() => toggleInterest(cat)} />
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={{ gap: space.sm }}>
              <Text style={[textStyle('title1', lang), { color: c.text, letterSpacing: -0.3 }]} accessibilityRole="header">
                {t('Societies for you')}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 16, lineHeight: 24 }}>
                {t('Follow a few to fill Discover with their events. Tap to follow, tap again to undo.')}
              </Text>
            </View>
            <View>
              <View style={styles.listHead}>
                <Text style={[textStyle('title2', lang), { color: c.text, flex: 1 }]} accessibilityRole="header">
                  {t('Suggested societies')}
                </Text>
                {notFollowed.length > 1 && <Button small variant="plain" title={t('Follow all')} onPress={followAll} />}
              </View>
              <View style={{ marginHorizontal: -space.lg }}>
                {societies.loading && !societies.data
                  ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} height={72} round={0} style={{ marginBottom: 1 }} />)
                  : suggestions.map((s, i) => (
                      <View key={s.society.id}>
                        {i > 0 && <View style={[styles.rule, { backgroundColor: c.border }]} />}
                        <SuggestionRow suggestion={s} />
                      </View>
                    ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg), borderTopColor: step > 1 ? c.border : 'transparent' }]}>
        <Button
          title={
            step === 2 && interests.size
              ? t('Continue · {n} picked', { n: interests.size })
              : step < STEPS
                ? t('Continue')
                : followIds.size
                  ? t('Done · following {n}', { n: followIds.size })
                  : t('Done')
          }
          loading={busy}
          disabled={(step === 1 && !name.trim()) || (step === 2 && !interests.size)}
          hint={step === 1 ? t('Add your name to continue') : step === 2 ? t('Pick at least one to continue') : undefined}
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 104,
    borderRadius: 18,
    padding: 14,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  tileCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, minHeight: 44 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  rule: { height: StyleSheet.hairlineWidth, marginLeft: 76 },
  footer: { gap: 10, alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
});

/** Big colour tile for one interest, in the category's colour family; filled when picked. */
function InterestTile({ category, selected, onPress }: { category: string; selected: boolean; onPress: () => void }) {
  const dark = useIsDark();
  const art = avatarArt[societyFamily[category] ?? 'Slate'];
  const [soft, ink] = art[dark ? 'dark' : 'light'];
  const fg = selected ? '#FFFFFF' : ink;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${t(category)}, ${t(INTEREST_EXAMPLES[category])}`}
      style={({ pressed }) => [styles.tile, { backgroundColor: selected ? art.cover : soft, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      <Icon name={SOCIETY_ICONS[category]} size={26} color={fg} />
      <View>
        <Text style={{ color: fg, fontSize: 17, fontWeight: '700' }}>{t(category)}</Text>
        <Text style={{ color: fg, opacity: 0.85, fontSize: 12, lineHeight: 16 }} numberOfLines={2}>
          {t(INTEREST_EXAMPLES[category])}
        </Text>
      </View>
      {selected && (
        <View style={[styles.tileCheck, { backgroundColor: '#FFFFFF' }]}>
          <Icon name="checkmark" size={16} color={art.cover} />
        </View>
      )}
    </Pressable>
  );
}

/** Suggested society with why it's suggested; tapping anywhere on the row follows, like the button. */
function SuggestionRow({ suggestion: { society, reason } }: { suggestion: Suggestion }) {
  const c = useColors();
  const { toggleFollow } = useAuth();
  const why =
    reason === 'interest'
      ? t('Because you like {interest}', { interest: t(society.category) })
      : reason === 'college'
        ? t('In your college')
        : t('Popular on campus');
  return (
    <View style={[styles.suggestion, { backgroundColor: c.backgroundPlain }]}>
      <Pressable
        onPress={() => toggleFollow(society.id).catch((e) => showAlert(t('Could not update'), errorMessage(e)))}
        accessibilityRole="button"
        style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.6 : 1 }]}>
        <SocietyAvatar name={society.name} uri={society.logo_url} category={society.category} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontSize: 16, lineHeight: 21, fontWeight: '600' }} numberOfLines={2}>
            {society.name}
          </Text>
          <Text style={{ color: reason === 'popular' ? c.textSecondary : c.accentText, fontSize: 13 }} numberOfLines={1}>
            {why}
          </Text>
        </View>
      </Pressable>
      <FollowButton societyId={society.id} />
    </View>
  );
}
