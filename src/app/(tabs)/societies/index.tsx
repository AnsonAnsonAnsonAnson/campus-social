import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Skeleton } from '@/components/Skeleton';
import { SocietyCard, SocietyRow } from '@/components/SocietyRow';
import { Button, Chip, ChipRow, CircleButton, EmptyState, ErrorView, PageHeader, SearchField, SectionHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { recommendSocieties } from '@/lib/recommend';
import { SOCIETY_CATEGORIES } from '@/lib/constants';
import { space, useColors } from '@/lib/theme';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

export default function Societies() {
  const c = useColors();
  const { followIds, profile, requireSignIn } = useAuth();
  const college = profile?.college;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [showFollowing, setShowFollowing] = useState(false);

  const query = useDebouncedValue(search.trim(), 250);
  const q = useQuery(() => api.listSocieties({ search: query, category: category ?? undefined }), [query, category]);
  const upcoming = useQuery(() => api.listEvents({ from: new Date().toISOString(), limit: 200 }), []);

  const nextBySociety = useMemo(() => {
    const m = new Map<string, { starts_at: string; title: string }>();
    for (const e of upcoming.data ?? []) if (e.status === 'published' && !m.has(e.society_id)) m.set(e.society_id, e);
    return m;
  }, [upcoming.data]);

  const list = useMemo(() => (q.data ?? []).filter((s) => !showFollowing || followIds.has(s.id)), [q.data, showFollowing, followIds]);
  // Picks: ones you don't follow yet, your interests first, then your college, then the most followed.
  const interests = profile?.interests;
  const picks = useMemo(
    () => recommendSocieties(q.data ?? [], { interests: interests ?? [], college, exclude: followIds }).map((s) => s.society),
    [q.data, followIds, college, interests],
  );
  const browsing = !query && !showFollowing;

  return (
    <FlatList
      contentInsetAdjustmentBehavior="never"
      style={{ backgroundColor: c.backgroundPlain }}
      data={list}
      keyExtractor={(s) => s.id}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}
      ItemSeparatorComponent={() => (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: space.lg + 48 + space.md }} />
      )}
      ListHeaderComponent={
        <View>
          <PageHeader title={t('Societies')}>
            <CircleButton
              icon="add"
              text={t('Register society')}
              label={t('Register your society')}
              onPress={() => requireSignIn() && router.push('/new-society')}
            />
          </PageHeader>
          <SearchField placeholder={t('Search societies or colleges')} value={search} onChangeText={setSearch} />
          <View style={{ paddingTop: 14, paddingBottom: space.xs }}>
            <ChipRow>
              <Chip
                label={followIds.size ? `${t('Following')} ${followIds.size}` : t('Following')}
                icon="heart"
                selected={showFollowing}
                onPress={() => setShowFollowing((v) => !v)}
              />
              <Chip label={t('All')} selected={!category} onPress={() => setCategory(null)} />
              {SOCIETY_CATEGORIES.map((cat) => (
                <Chip key={cat} label={t(cat)} selected={category === cat} onPress={() => setCategory(cat === category ? null : cat)} />
              ))}
            </ChipRow>
          </View>
          {browsing && picks.length > 0 && (
            <>
              <SectionHeader title={t('Picked for you')} />
              {(!!interests?.length || !!profile?.college) && (
                <Text
                  style={{
                    color: c.textSecondary,
                    fontSize: 13,
                    marginHorizontal: space.lg,
                    marginTop: -space.sm,
                    marginBottom: space.sm,
                  }}>
                  {interests?.length
                    ? t('Based on your interests: {interests}', { interests: interests.map((i) => t(i)).join(t(', ')) })
                    : t('Based on your college: {college}', { college: t(profile!.college!) })}
                </Text>
              )}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}>
                {picks.map((s) => (
                  <SocietyCard key={s.id} society={s} />
                ))}
              </ScrollView>
            </>
          )}
          {list.length > 0 && (
            <SectionHeader
              title={showFollowing ? t('Following · {n}', { n: list.length }) : t('All societies · {n}', { n: list.length })}
            />
          )}
        </View>
      }
      renderItem={({ item }) => <SocietyRow society={item} next={upcoming.data ? (nextBySociety.get(item.id) ?? null) : undefined} />}
      ListEmptyComponent={
        q.loading ? (
          <View style={{ gap: space.lg, padding: space.lg }} accessibilityLabel={t('Loading')}>
            {Array.from({ length: 6 }, (_, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Skeleton width={44} height={44} round={12} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skeleton width="60%" height={15} />
                  <Skeleton width="35%" height={12} />
                </View>
              </View>
            ))}
          </View>
        ) : q.error ? (
          <ErrorView message={q.error} onRetry={q.refresh} />
        ) : (
          <EmptyState
            icon="people-outline"
            title={showFollowing ? t('You are not following any societies yet') : t('No societies found')}
            body={showFollowing ? t('Follow societies to see their events first on Discover and in your calendar.') : undefined}
          />
        )
      }
      ListFooterComponent={
        <View style={{ padding: space.lg, paddingBottom: 48 }}>
          <SectionHeader title={t('Run a society?')} />
          <Button
            title={t('Register your society')}
            icon="megaphone-outline"
            variant="secondary"
            onPress={() => requireSignIn() && router.push('/new-society')}
          />
        </View>
      }
    />
  );
}
