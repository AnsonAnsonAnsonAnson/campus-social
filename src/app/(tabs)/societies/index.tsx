import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { Skeleton } from '@/components/Skeleton';
import { SocietyRow } from '@/components/SocietyRow';
import { Button, Chip, ChipRow, EmptyState, ErrorView, SectionHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SOCIETY_CATEGORIES } from '@/lib/constants';
import { space, useColors } from '@/lib/theme';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useQuery } from '@/lib/useQuery';

export default function Societies() {
  const c = useColors();
  const { followIds, requireSignIn } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [showFollowing, setShowFollowing] = useState(false);

  const query = useDebouncedValue(search.trim(), 250);
  const q = useQuery(() => api.listSocieties({ search: query, category: category ?? undefined }), [query, category]);

  const list = useMemo(() => (q.data ?? []).filter((s) => !showFollowing || followIds.has(s.id)), [q.data, showFollowing, followIds]);

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: 'Search societies',
            onChangeText: (e) => setSearch(e.nativeEvent.text),
            onCancelButtonPress: () => setSearch(''),
          },
        }}
      />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: c.background }}
        data={list}
        keyExtractor={(s) => s.id}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.border, marginLeft: 72 }} />}
        ListHeaderComponent={
          <View style={{ paddingVertical: space.sm }}>
            <ChipRow>
              <Chip label="Following" icon="heart" selected={showFollowing} onPress={() => setShowFollowing((v) => !v)} />
              <Chip label="All" selected={!category} onPress={() => setCategory(null)} />
              {SOCIETY_CATEGORIES.map((cat) => (
                <Chip key={cat} label={cat} selected={category === cat} onPress={() => setCategory(cat === category ? null : cat)} />
              ))}
            </ChipRow>
          </View>
        }
        renderItem={({ item }) => <SocietyRow society={item} />}
        ListEmptyComponent={
          q.loading ? (
            <View style={{ gap: space.lg, padding: space.lg }} accessibilityLabel="Loading">
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
              title={showFollowing ? 'You are not following any societies yet' : 'No societies found'}
              body={showFollowing ? 'Follow societies to see their events first on Discover and in your calendar.' : undefined}
            />
          )
        }
        ListFooterComponent={
          <View style={{ padding: space.lg, paddingBottom: 48 }}>
            <SectionHeader title="Run a society?" />
            <Button
              title="Register your society"
              icon="megaphone-outline"
              variant="secondary"
              onPress={() => requireSignIn() && router.push('/new-society')}
            />
          </View>
        }
      />
    </>
  );
}
