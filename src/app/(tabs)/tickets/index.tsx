import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { TicketCard } from '@/components/TicketCard';
import { ListSkeleton } from '@/components/Skeleton';
import { Button, Chip, ChipRow, EmptyState, ErrorView } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { syncReminders } from '@/lib/notifications';
import { space, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';

export default function Tickets() {
  const c = useColors();
  const { user } = useAuth();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const q = useQuery(() => api.myTickets(), [user?.id]);

  // Tickets just loaded fresh from the server: a good moment to fix up reminders.
  useEffect(() => {
    if (q.data) syncReminders(q.data).catch(() => undefined);
  }, [q.data]);

  const { upcoming, past } = useMemo(() => {
    const now = new Date().toISOString();
    const all = q.data ?? [];
    return {
      upcoming: all.filter((t) => t.event.ends_at >= now).sort((a, b) => a.event.starts_at.localeCompare(b.event.starts_at)),
      past: all.filter((t) => t.event.ends_at < now).sort((a, b) => b.event.starts_at.localeCompare(a.event.starts_at)),
    };
  }, [q.data]);

  if (!user) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: c.background }}
        contentContainerStyle={{ flexGrow: 1 }}>
        <EmptyState
          icon="ticket-outline"
          title="Your tickets live here"
          body="Sign in with your CUHK email to register for events and get QR tickets."
          action={<Button title="Sign in" onPress={() => router.push('/sign-in')} />}
        />
      </ScrollView>
    );
  }

  const list = tab === 'upcoming' ? upcoming : past;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
      <ChipRow>
        <Chip
          label={`Upcoming${upcoming.length ? ` (${upcoming.length})` : ''}`}
          selected={tab === 'upcoming'}
          onPress={() => setTab('upcoming')}
        />
        <Chip label="Past" selected={tab === 'past'} onPress={() => setTab('past')} />
      </ChipRow>
      {q.loading && !q.data ? (
        <ListSkeleton rows={3} />
      ) : q.error && !q.data ? (
        <ErrorView message={q.error} onRetry={q.refresh} />
      ) : list.length ? (
        <View style={{ gap: space.lg, marginTop: space.md }}>
          {list.map((t, i) => (
            // Only the next event shows its QR up front; others show it on the event page.
            <TicketCard key={t.id} ticket={t} showQR={tab === 'upcoming' && i === 0} />
          ))}
        </View>
      ) : (
        <EmptyState
          icon="ticket-outline"
          title={tab === 'upcoming' ? 'No upcoming tickets' : 'No past events yet'}
          body={tab === 'upcoming' ? 'Find something fun on Discover and sign up in one tap.' : undefined}
          action={
            tab === 'upcoming' ? (
              <Button title="Discover events" variant="secondary" onPress={() => router.navigate('/discover')} />
            ) : undefined
          }
        />
      )}
    </ScrollView>
  );
}
