import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { toast } from '@/components/Toast';
import { Button, Card, EmptyState, ErrorView, ListGroup, ListRow, Loading, Pill, SectionHeader, SocietyAvatar } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { compactNumber, formatWhen } from '@/lib/format';
import { pickAndUploadImage } from '@/lib/pickImage';
import { radius, space, useColors } from '@/lib/theme';
import type { ReviewStatus } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

const REVIEW_TONE: Record<ReviewStatus, 'warning' | 'success' | 'danger'> = { pending: 'warning', approved: 'success', rejected: 'danger' };

export default function ManageSociety() {
  const { societyId } = useLocalSearchParams<{ societyId: string }>();
  const c = useColors();

  const q = useQuery(async () => {
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const [society, events, banners, mine] = await Promise.all([
      api.getSociety(societyId),
      api.listEvents({ societyIds: [societyId], from: weekAgo, includeDrafts: true }),
      api.societyBanners(societyId),
      api.mySocieties(),
    ]);
    const role = mine.find((m) => m.id === societyId)?.role ?? 'editor';
    return { society, events, banners, role };
  }, [societyId]);

  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const s = q.data?.society;
  if (!s) return <ErrorView message="You don't have access to this society." />;

  const isAdmin = q.data!.role !== 'editor';

  const changeLogo = async () => {
    if (!isAdmin) return;
    try {
      const url = await pickAndUploadImage([1, 1]);
      if (!url) return;
      await api.updateSociety(s.id, { logo_url: url });
      invalidate();
    } catch (e) {
      showAlert('Could not update logo', errorMessage(e));
    }
  };

  const removeBanner = async (id: string, title: string) => {
    if (!(await confirmAsync('Remove banner?', `“${title}” will stop showing on Discover.`, 'Remove', true))) return;
    try {
      await api.deleteBanner(id);
      invalidate();
      toast('Banner removed');
    } catch (e) {
      showAlert('Could not remove', errorMessage(e));
    }
  };

  const upcoming = q.data!.events;
  const totalGoing = upcoming.reduce((n, e) => n + e.confirmed_count, 0);

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
      <Stack.Screen options={{ title: s.short_name ?? s.name }} />

      <Card style={styles.header}>
        <Pressable onPress={changeLogo} disabled={!isAdmin} accessibilityLabel="Change logo">
          <SocietyAvatar name={s.name} uri={s.logo_url} size={64} />
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }}>{s.name}</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Pill
              label={s.status === 'approved' ? (s.verified ? 'Verified' : 'Live') : s.status === 'pending' ? 'Pending review' : 'Rejected'}
              tone={REVIEW_TONE[s.status]}
            />
            <Pill label={`You: ${q.data!.role}`} />
          </View>
        </View>
      </Card>
      {s.status === 'pending' && (
        <Text style={[styles.note, { color: c.textSecondary }]}>
          The Student Affairs team is reviewing your society. You can prepare events now; students will see them once you’re approved.
        </Text>
      )}

      <View style={styles.stats}>
        <Stat label="Followers" value={compactNumber(s.follower_count)} />
        <Stat label="Upcoming" value={String(upcoming.filter((e) => e.ends_at >= new Date().toISOString()).length)} />
        <Stat label="Sign-ups" value={compactNumber(totalGoing)} />
      </View>

      <Button
        style={{ marginHorizontal: space.lg }}
        title="New event"
        icon="add"
        onPress={() => router.push({ pathname: '/manage/event-form', params: { societyId: s.id } })}
      />

      <View style={{ marginTop: space.lg }}>
        <ListGroup>
          {isAdmin && (
            <ListRow
              icon="create-outline"
              title="Edit society details"
              onPress={() => router.push({ pathname: '/manage/edit-society', params: { societyId: s.id } })}
            />
          )}
          <ListRow
            icon="people-outline"
            title="Committee"
            onPress={() => router.push({ pathname: '/manage/members', params: { societyId: s.id } })}
          />
          <ListRow icon="eye-outline" title="View public page" onPress={() => router.push(`/society/${s.id}`)} />
        </ListGroup>
      </View>

      <SectionHeader title="Events" />
      {upcoming.length ? (
        <View style={{ gap: space.sm }}>
          {upcoming.map((e) => (
            <Pressable
              key={e.id}
              onPress={() => router.push({ pathname: '/manage/attendees', params: { eventId: e.id } })}
              style={({ pressed }) => [styles.eventRow, { backgroundColor: pressed ? c.fill : c.card }]}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: c.text, fontWeight: '600', fontSize: 16 }} numberOfLines={1}>
                  {e.title}
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>{formatWhen(e.starts_at)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {e.removed_at ? (
                  <Pill label="hidden" tone="danger" />
                ) : (
                  <Pill label={e.status} tone={e.status === 'published' ? 'success' : e.status === 'draft' ? 'warning' : 'danger'} />
                )}
                {e.registration_required && (
                  <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                    {e.confirmed_count}
                    {e.capacity ? `/${e.capacity}` : ''} going
                  </Text>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <EmptyState
          icon="calendar-outline"
          title="No events yet"
          body="Create your first event. Students who follow you will see it on Discover."
        />
      )}

      <SectionHeader title="Promotional banners" />
      {q.data!.banners.length ? (
        <View style={{ gap: space.sm }}>
          {q.data!.banners.map((b) => (
            <View key={b.id} style={[styles.eventRow, { backgroundColor: c.card }]}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: c.text, fontWeight: '600' }}>{b.title}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>Until {formatWhen(b.ends_at)}</Text>
              </View>
              <Pill label={b.status} tone={REVIEW_TONE[b.status]} />
              <Button small variant="plain" title="Remove" onPress={() => removeBanner(b.id, b.title)} />
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ color: c.textSecondary, marginHorizontal: space.lg }}>
          Open one of your events and tap Promote to request a banner on the Discover page.
        </Text>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: c.card }]}>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, margin: space.lg },
  note: { marginHorizontal: space.lg, marginTop: -space.sm, marginBottom: space.lg, fontSize: 14, lineHeight: 20 },
  stats: { flexDirection: 'row', gap: space.sm, marginHorizontal: space.lg, marginBottom: space.lg },
  stat: { flex: 1, borderRadius: radius.md, padding: space.md, alignItems: 'center' },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    padding: space.md,
    borderRadius: radius.md,
  },
});
