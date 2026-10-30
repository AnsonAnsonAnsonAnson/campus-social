import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Skeleton } from '@/components/Skeleton';
import { Field, Icon, tap } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COLLEGES } from '@/lib/constants';
import { showAlert } from '@/lib/dialog';
import { categoriesFor, revealRelated, startingTopics, TOPICS } from '@/lib/interests';
import { markOnboarded } from '@/lib/onboarding';
import { recommendSocieties } from '@/lib/recommend';
import { avatarArt, familyFor, initialsFor, space, useColors } from '@/lib/theme';
import type { Society } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { changeLanguage, t, useLang } from '@/lib/i18n';

const STEPS = 3;
const MIN_TOPICS = 3;

/** Grow and shift the bubbles when topics or societies appear (native only; web just jumps). */
function animateLayout() {
  if (Platform.OS === 'ios') LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

/**
 * First-run setup, built like a streaming app's taste picker rather than a form:
 * 1. who you are (name, college),
 * 2. topics you're into, as bubbles; picking one reveals related ones, pick 3 or more,
 * 3. a grid of societies picked from those, one tap to follow; following one
 *    brings in similar ones.
 */
export default function Welcome() {
  const c = useColors();
  const { profile, refreshProfile, followIds, toggleFollow } = useAuth();
  // Never prefill from the email: for students that's their student ID, not a name.
  const [name, setName] = useState(profile?.display_name ?? '');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [college, setCollege] = useState<string | null>(profile?.college ?? null);
  const [noCollege, setNoCollege] = useState(false);
  const [topics, setTopics] = useState<string[]>([]);
  const [shownTopics, setShownTopics] = useState(startingTopics);
  const [topicSearch, setTopicSearch] = useState('');
  const [moreLike, setMoreLike] = useState<{ after: string; ids: string[] }[]>([]);
  const [societySearch, setSocietySearch] = useState('');
  const [busy, setBusy] = useState(false);
  const lang = useLang();
  const insets = useSafeAreaInsets();

  const societies = useQuery(() => api.listSocieties({}));
  const byId = useMemo(() => new Map((societies.data ?? []).map((s) => [s.id, s])), [societies.data]);

  const toggleTopic = (label: string) => {
    animateLayout();
    if (topics.includes(label)) setTopics(topics.filter((x) => x !== label));
    else {
      setTopics([...topics, label]);
      setShownTopics((shown) => revealRelated(shown.includes(label) ? shown : [label, ...shown], label));
      setTopicSearch('');
    }
  };

  const topicQuery = topicSearch.trim().toLowerCase();
  const visibleTopics = topicQuery
    ? TOPICS.map((x) => x.label).filter((label) => label.toLowerCase().includes(topicQuery) || t(label).toLowerCase().includes(topicQuery))
    : shownTopics;

  // The society grid is worked out on arrival (it doesn't depend on follows), then only grows
  // as "more like this" societies slot in after ones you follow, so tiles don't jump as you tap.
  const suggested = useMemo(
    () =>
      step === 3 && societies.data
        ? recommendSocieties(societies.data, { interests: categoriesFor(topics), college }, { min: 6, max: 9 }).map((s) => s.society.id)
        : [],
    [step, societies.data, topics, college],
  );
  const shownSocieties = useMemo(
    () =>
      moreLike.reduce((list, { after, ids }) => {
        const fresh = ids.filter((id) => !list.includes(id));
        const at = list.indexOf(after);
        return at < 0 ? [after, ...fresh, ...list] : [...list.slice(0, at + 1), ...fresh, ...list.slice(at + 1)];
      }, suggested),
    [suggested, moreLike],
  );

  const reasons = useMemo(() => {
    // The first topic you picked in each category, for "Because you like Hiking".
    const topicFor = new Map<string, string>();
    for (const label of topics) {
      const category = TOPICS.find((x) => x.label === label)?.category;
      if (category && !topicFor.has(category)) topicFor.set(category, label);
    }
    return (s: Society) =>
      topicFor.has(s.category)
        ? t('Because you like {interest}', { interest: t(topicFor.get(s.category)!) })
        : college && s.college === college
          ? t('In your college')
          : t('Popular on campus');
  }, [topics, college]);

  const toggleSociety = (s: Society) => {
    const follow = !followIds.has(s.id);
    toggleFollow(s.id).catch((e) => showAlert(t('Could not update'), errorMessage(e)));
    if (!follow) return;
    // "More like this": other societies of the same kind slot in after the one you followed.
    animateLayout();
    const similar = (societies.data ?? [])
      .filter((x) => x.category === s.category && !shownSocieties.includes(x.id))
      .sort((a, b) => b.follower_count - a.follower_count)
      .slice(0, 3)
      .map((x) => x.id);
    setMoreLike((prev) => [...prev, { after: s.id, ids: similar }]);
    setSocietySearch('');
  };

  const societyQuery = societySearch.trim().toLowerCase();
  const visibleSocieties = societyQuery
    ? (societies.data ?? []).filter(
        (s) => s.name.toLowerCase().includes(societyQuery) || (s.short_name ?? '').toLowerCase().includes(societyQuery),
      )
    : shownSocieties.map((id) => byId.get(id)).filter((s): s is Society => !!s);

  const finish = async (save: boolean) => {
    setBusy(true);
    try {
      if (save) {
        await api.updateProfile({ display_name: name.trim() || undefined, college, interests: categoriesFor(topics) });
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

  const remaining = MIN_TOPICS - topics.length;
  const footer =
    step === 1
      ? { title: t('Continue'), disabled: !name.trim(), hint: t('Add your name to continue'), onPress: () => setStep(2) }
      : step === 2
        ? {
            title: remaining > 0 ? t('Pick {n} more', { n: remaining }) : t('Next'),
            disabled: remaining > 0,
            hint: t('Pick at least 3 to continue'),
            onPress: () => setStep(3),
          }
        : {
            title: followIds.size ? t('Done · following {n}', { n: followIds.size }) : t('Done'),
            disabled: false,
            hint: undefined,
            onPress: () => finish(true),
          };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.backgroundPlain }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.top, { paddingTop: Math.max(insets.top, space.md) }]}>
        {step > 1 && (
          <Pressable
            onPress={() => {
              // Coming back to change topics means a fresh set of societies next time.
              if (step === 3) setMoreLike([]);
              setStep((step - 1) as 1 | 2);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('Back')}
            style={{ marginLeft: -6 }}>
            <Icon name="chevron-back" size={24} color={c.text} />
          </Pressable>
        )}
        <View style={{ flex: 1, flexDirection: 'row', gap: 4 }} accessibilityLabel={t('Step {n} of {total}', { n: step, total: STEPS })}>
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} style={[styles.stepBar, { backgroundColor: i < step ? c.ink : c.fillStrong }]} />
          ))}
        </View>
        <Pressable
          onPress={() => changeLanguage(lang === 'en' ? 'zh-Hant' : 'en', '/welcome')}
          accessibilityRole="button"
          accessibilityLabel={t('Language')}
          style={styles.topLink}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: c.textSecondary }}>{lang === 'en' ? '中文' : 'English'}</Text>
        </Pressable>
        <Pressable onPress={() => finish(false)} accessibilityRole="button" style={styles.topLink}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: c.textSecondary }}>{t('Skip')}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xl, gap: space.xl }}
        keyboardShouldPersistTaps="handled">
        {step === 1 ? (
          <>
            <Headline
              title={t('Welcome to Campus Social')}
              body={t('Every society, event and ticket at CUHK in one place. First, who are you?')}
            />
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
            <View style={{ gap: space.md }}>
              <Text style={[styles.subhead, { color: c.text }]}>{t('Which college are you in?')}</Text>
              <View style={styles.bubbles} accessibilityRole="radiogroup">
                {[...COLLEGES, 'none' as const].map((col) => {
                  const value = col === 'none' ? null : col;
                  return (
                    <Bubble
                      key={col}
                      label={col === 'none' ? t('Not applicable') : t(col)}
                      selected={college === value && (value !== null || noCollege)}
                      role="radio"
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
            <Headline title={t('What are you into?')} body={t('Pick 3 or more. We’ll find societies and events to match.')} />
            <SearchBox value={topicSearch} onChangeText={setTopicSearch} placeholder={t('Search topics')} />
            <View style={styles.bubbles}>
              {visibleTopics.map((label) => (
                <Bubble key={label} label={t(label)} selected={topics.includes(label)} big onPress={() => toggleTopic(label)} />
              ))}
              {!visibleTopics.length && <Text style={{ color: c.textSecondary, fontSize: 15 }}>{t('No topics match')}</Text>}
            </View>
          </>
        ) : (
          <>
            <Headline
              title={t('Follow societies you’ll like')}
              body={t('Picked from what you’re into. Tap to follow, and we’ll show more like it.')}
            />
            <SearchBox value={societySearch} onChangeText={setSocietySearch} placeholder={t('Search societies')} />
            <View style={styles.grid}>
              {societies.loading && !societies.data
                ? Array.from({ length: 6 }, (_, i) => (
                    <View key={i} style={styles.gridCell}>
                      <Skeleton width={92} height={92} round={46} />
                    </View>
                  ))
                : visibleSocieties.map((s) => (
                    <SocietyBubble
                      key={s.id}
                      society={s}
                      reason={reasons(s)}
                      following={followIds.has(s.id)}
                      onPress={() => toggleSociety(s)}
                    />
                  ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
        <Pressable
          onPress={() => {
            tap();
            footer.onPress();
          }}
          disabled={footer.disabled || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: footer.disabled || busy, busy }}
          accessibilityHint={footer.disabled ? footer.hint : undefined}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: footer.disabled ? c.fillStrong : c.ink, transform: [{ scale: pressed ? 0.98 : 1 }] },
          ]}>
          <Text style={[styles.ctaText, { color: footer.disabled ? c.textTertiary : c.onInk }]}>{busy ? t('Saving…') : footer.title}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Headline({ title, body }: { title: string; body: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 10 }}>
      <Text style={[styles.headline, { color: c.text }]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={{ color: c.textSecondary, fontSize: 17, lineHeight: 24 }}>{body}</Text>
    </View>
  );
}

function SearchBox({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder: string }) {
  const c = useColors();
  return (
    <View style={[styles.search, { backgroundColor: c.fill }]}>
      <Icon name="search" size={20} color={c.text} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textTertiary}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={placeholder}
        style={{ flex: 1, fontSize: 17, fontWeight: '600', color: c.text, paddingVertical: 0 }}
      />
    </View>
  );
}

/** Rounded topic bubble: grey until picked, then solid ink with a check. */
function Bubble({
  label,
  selected,
  onPress,
  big,
  role = 'checkbox',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  big?: boolean;
  role?: 'checkbox' | 'radio';
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [
        styles.bubble,
        big && styles.bubbleBig,
        { backgroundColor: selected ? c.ink : c.fill, transform: [{ scale: pressed ? 0.95 : 1 }] },
      ]}>
      <Text style={{ color: selected ? c.onInk : c.text, fontSize: big ? 17 : 15, fontWeight: '700' }}>{label}</Text>
      {selected && <Icon name="checkmark" size={big ? 18 : 16} color={c.onInk} />}
    </Pressable>
  );
}

/** Big round society logo with its name; a check badge once followed. */
function SocietyBubble({
  society,
  reason,
  following,
  onPress,
}: {
  society: Society;
  reason: string;
  following: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  const art = avatarArt[familyFor(society.category, society.name)];
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: following }}
      accessibilityLabel={`${society.name}, ${reason}`}
      accessibilityHint={following ? t('Following') : t('Follow')}
      style={({ pressed }) => [styles.gridCell, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
      <View style={[styles.logoRing, { borderColor: following ? c.tint : 'transparent' }]}>
        {society.logo_url ? (
          <Image source={{ uri: society.logo_url }} style={styles.logo} contentFit="cover" />
        ) : (
          <View style={[styles.logo, { backgroundColor: art.cover, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: '#FFFFFF', fontSize: 30, fontWeight: '800' }} allowFontScaling={false}>
              {initialsFor(society.name)}
            </Text>
          </View>
        )}
        {following && (
          <View style={[styles.badge, { backgroundColor: c.tint, borderColor: c.backgroundPlain }]}>
            <Icon name="checkmark" size={16} color="#FFFFFF" />
          </View>
        )}
      </View>
      <Text style={{ color: c.text, fontSize: 14, lineHeight: 18, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
        {society.short_name || society.name}
      </Text>
      <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 16, textAlign: 'center' }} numberOfLines={2}>
        {reason}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: space.lg, minHeight: 44 },
  topLink: { minHeight: 44, justifyContent: 'center' },
  stepBar: { flex: 1, height: 4, borderRadius: 2, maxWidth: 48 },
  headline: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8 },
  subhead: { fontSize: 20, lineHeight: 26, fontWeight: '800', letterSpacing: -0.3 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: 26, paddingHorizontal: 18 },
  bubbles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bubble: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, borderRadius: 22, paddingHorizontal: 18 },
  bubbleBig: { minHeight: 52, borderRadius: 26, paddingHorizontal: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.xl, marginHorizontal: -space.xs },
  gridCell: { width: '33.33%', alignItems: 'center', gap: 4, paddingHorizontal: space.xs },
  logoRing: { padding: 3, borderRadius: 52, borderWidth: 3, marginBottom: 4 },
  logo: { width: 92, height: 92, borderRadius: 46 },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md },
  cta: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 18, fontWeight: '800' },
});
