import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EventRow } from '@/components/EventCard';
import { FollowButton } from '@/components/SocietyRow';
import { Artwork, Button, EmptyState, ErrorView, Icon, Loading, Pill, SectionHeader, SocietyAvatar } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { compactNumber } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';

export default function SocietyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { user, requireSignIn } = useAuth();

  const q = useQuery(async () => {
    const now = new Date().toISOString();
    const [society, upcoming, past, mine] = await Promise.all([
      api.getSociety(id),
      api.listEvents({ societyIds: [id], from: now }),
      api.listEvents({ societyIds: [id], to: now }),
      api.mySocieties(),
    ]);
    return {
      society,
      upcoming,
      past: past
        .filter((e) => e.ends_at < now)
        .reverse()
        .slice(0, 5),
      isCommittee: mine.some((s) => s.id === id),
    };
  }, [id, user?.id]);

  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const s = q.data?.society;
  if (!s) return <ErrorView message="This society could not be found." />;

  const instagram = s.instagram?.replace(/^@/, '');

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
      <Stack.Screen
        options={{
          title: s.short_name ?? s.name,
          headerRight: () => (
            <Pressable
              hitSlop={12}
              accessibilityLabel="Report society"
              onPress={() => requireSignIn() && router.push({ pathname: '/report', params: { type: 'society', id: s.id, name: s.name } })}>
              <Icon name="flag-outline" size={20} color={c.tint} />
            </Pressable>
          ),
        }}
      />
      <Artwork seed={s.id} uri={s.cover_url} style={styles.cover} />
      <View style={styles.headerBody}>
        <View style={[styles.avatarRing, { backgroundColor: c.background }]}>
          <SocietyAvatar name={s.name} uri={s.logo_url} size={84} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.name, { color: c.text }]}>{s.name}</Text>
          {s.verified && <Icon name="checkmark-circle" size={20} color={c.tint} />}
        </View>
        <Text style={{ color: c.textSecondary }}>
          {s.category}
          {s.college ? ` · ${s.college} College` : ''} · {compactNumber(s.follower_count)} followers
        </Text>
        {s.status !== 'approved' && <Pill label="Pending review: only your committee can see this" tone="warning" />}
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
          <View style={{ flex: 1 }}>
            <FollowButton societyId={s.id} small={false} />
          </View>
          {q.data?.isCommittee && (
            <Button title="Manage" icon="settings-outline" variant="secondary" onPress={() => router.push(`/manage/${s.id}`)} />
          )}
        </View>
      </View>

      <View style={[styles.about, { backgroundColor: c.card }]}>
        <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>{s.description || 'No description yet.'}</Text>
        <View style={{ flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' }}>
          {instagram && (
            <Pressable onPress={() => Linking.openURL(`https://instagram.com/${instagram}`)} style={styles.link}>
              <Icon name="logo-instagram" color={c.tint} />
              <Text style={{ color: c.tint }}>@{instagram}</Text>
            </Pressable>
          )}
          {s.website && (
            <Pressable onPress={() => WebBrowser.openBrowserAsync(s.website!)} style={styles.link}>
              <Icon name="globe-outline" color={c.tint} />
              <Text style={{ color: c.tint }}>Website</Text>
            </Pressable>
          )}
          {s.contact_email && (
            <Pressable onPress={() => Linking.openURL(`mailto:${s.contact_email}`)} style={styles.link}>
              <Icon name="mail-outline" color={c.tint} />
              <Text style={{ color: c.tint }}>Email</Text>
            </Pressable>
          )}
        </View>
      </View>

      <SectionHeader title="Upcoming events" />
      <View style={{ gap: space.sm }}>
        {q.data?.upcoming.length ? (
          q.data.upcoming.map((e) => <EventRow key={e.id} event={e} />)
        ) : (
          <EmptyState icon="calendar-outline" title="No upcoming events" body="Follow this society to see new events first." />
        )}
      </View>

      {!!q.data?.past.length && (
        <>
          <SectionHeader title="Past events" />
          <View style={{ gap: space.sm, opacity: 0.7 }}>
            {q.data.past.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cover: { height: 140 },
  headerBody: { paddingHorizontal: space.lg, gap: 4, marginTop: -48 },
  avatarRing: { padding: 4, borderRadius: 28, alignSelf: 'flex-start', marginBottom: space.sm },
  name: { fontSize: 24, fontWeight: '800', flexShrink: 1 },
  about: { margin: space.lg, marginBottom: 0, padding: space.lg, borderRadius: radius.lg, gap: space.md },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
