import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ChipRow, EmptyState, ErrorView, Icon, Loading, Pill } from '@/components/ui';
import { api } from '@/lib/api';
import { formatTime, formatWhen } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';

type Filter = 'all' | 'in' | 'not-in' | 'waitlist';

export default function Attendees() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useColors();
  const [filter, setFilter] = useState<Filter>('all');

  const q = useQuery(async () => {
    const [event, attendees] = await Promise.all([api.getEvent(eventId), api.listAttendees(eventId)]);
    return { event, attendees };
  }, [eventId]);

  const list = useMemo(() => {
    const all = q.data?.attendees ?? [];
    if (filter === 'in') return all.filter((a) => a.checked_in_at);
    if (filter === 'not-in') return all.filter((a) => a.status === 'confirmed' && !a.checked_in_at);
    if (filter === 'waitlist') return all.filter((a) => a.status === 'waitlisted');
    return all;
  }, [q.data, filter]);

  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const e = q.data?.event;
  if (!e) return <ErrorView message="Event not found." />;

  const all = q.data!.attendees;
  const checkedIn = all.filter((a) => a.checked_in_at).length;
  const confirmed = all.filter((a) => a.status === 'confirmed').length;
  const waitlisted = all.filter((a) => a.status === 'waitlisted').length;

  const exportCsv = () => {
    const rows = [
      ['Name', 'Email', 'College', 'Status', 'Checked in', 'Registered'],
      ...all.map((a) => [a.display_name, a.email, a.college ?? '', a.status, a.checked_in_at ?? '', a.created_at]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    Share.share({ title: `${e.title} attendees.csv`, message: csv });
  };

  return (
    <>
      <Stack.Screen options={{ title: e.title }} />
      <FlatList
        style={{ backgroundColor: c.background }}
        data={list}
        keyExtractor={(a) => a.registration_id}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}
        contentContainerStyle={{ paddingBottom: 48 }}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingVertical: space.lg }}>
            <Text style={{ color: c.textSecondary, marginHorizontal: space.lg }}>{formatWhen(e.starts_at, e.ends_at)}</Text>
            <View style={styles.stats}>
              <Stat value={`${confirmed}${e.capacity ? `/${e.capacity}` : ''}`} label="Going" />
              <Stat value={String(checkedIn)} label="Checked in" />
              <Stat value={String(waitlisted)} label="Waitlist" />
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm, marginHorizontal: space.lg }}>
              <Button
                style={{ flex: 1 }}
                title="Scan tickets"
                icon="qr-code-outline"
                onPress={() => router.push({ pathname: '/manage/scan', params: { eventId: e.id, title: e.title } })}
              />
              <Button
                title="Edit"
                icon="create-outline"
                variant="secondary"
                onPress={() => router.push({ pathname: '/manage/event-form', params: { eventId: e.id } })}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm, marginHorizontal: space.lg }}>
              <Button
                style={{ flex: 1 }}
                small
                title="Promote"
                icon="megaphone-outline"
                variant="secondary"
                onPress={() => router.push({ pathname: '/manage/promote', params: { eventId: e.id } })}
              />
              <Button style={{ flex: 1 }} small title="Export CSV" icon="share-outline" variant="secondary" onPress={exportCsv} />
            </View>
            <ChipRow>
              <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label="Checked in" selected={filter === 'in'} onPress={() => setFilter('in')} />
              <Chip label="Not arrived" selected={filter === 'not-in'} onPress={() => setFilter('not-in')} />
              <Chip label="Waitlist" selected={filter === 'waitlist'} onPress={() => setFilter('waitlist')} />
            </ChipRow>
          </View>
        }
        ItemSeparatorComponent={() => (
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: space.lg }} />
        )}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: c.card }]}>
            <Icon
              name={item.checked_in_at ? 'checkmark-circle' : item.status === 'waitlisted' ? 'hourglass-outline' : 'ellipse-outline'}
              size={22}
              color={item.checked_in_at ? c.success : c.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 16 }}>{item.display_name || item.email}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                {item.email}
                {item.college ? ` · ${item.college}` : ''}
              </Text>
            </View>
            {item.checked_in_at ? (
              <Text style={{ color: c.success, fontSize: 13 }}>{formatTime(item.checked_in_at)}</Text>
            ) : item.status === 'waitlisted' ? (
              <Pill label="Waitlist" tone="warning" />
            ) : null}
          </View>
        )}
        ListEmptyComponent={<EmptyState icon="people-outline" title="No one here yet" body="Share your event so people can sign up." />}
      />
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const c = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: c.card }]}>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space.sm, marginHorizontal: space.lg },
  stat: { flex: 1, padding: space.md, borderRadius: radius.md, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
});
