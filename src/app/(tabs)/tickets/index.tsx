import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { TicketCard } from '@/components/TicketCard';
import { ListSkeleton } from '@/components/Skeleton';
import { Button, Chip, ChipRow, EmptyState, ErrorView, Icon } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { syncReminders } from '@/lib/notifications';
import { ticketsWithFallback } from '@/lib/ticketCache';
import { radius, space, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { formatDay, formatTime } from '@/lib/format';
import { t } from '@/lib/i18n';

export default function Tickets() {
  const c = useColors();
  const { user } = useAuth();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const q = useQuery(async () => (user ? ticketsWithFallback(user.id, () => api.myTickets()) : null), [user?.id]);
  const offline = !!q.data?.offline;

  // Tickets just loaded fresh from the server: a good moment to fix up reminders.
  useEffect(() => {
    if (q.data && !q.data.offline) syncReminders(q.data.tickets).catch(() => undefined);
  }, [q.data]);

  const { upcoming, past } = useMemo(() => {
    const now = new Date().toISOString();
    const all = q.data?.tickets ?? [];
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
          title={t('Your tickets live here')}
          body={t('Sign in with your CUHK email to register for events and get QR tickets.')}
          action={<Button title={t('Sign in')} onPress={() => router.push('/sign-in')} />}
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
          label={upcoming.length ? t('Upcoming ({n})', { n: upcoming.length }) : t('Upcoming')}
          selected={tab === 'upcoming'}
          onPress={() => setTab('upcoming')}
        />
        <Chip label={t('Past')} selected={tab === 'past'} onPress={() => setTab('past')} />
      </ChipRow>
      {offline && q.data?.savedAt && (
        <View
          style={{
            flexDirection: 'row',
            gap: space.sm,
            alignItems: 'center',
            marginHorizontal: space.lg,
            marginTop: space.sm,
            padding: space.md,
            borderRadius: radius.md,
            backgroundColor: c.card,
          }}>
          <Icon name="cloud-offline-outline" size={18} color={c.warning} />
          <Text style={{ color: c.textSecondary, flex: 1, fontSize: 13 }}>
            {t('Offline. Showing tickets saved {when}. QR codes still work at the door.', {
              when: `${formatDay(q.data.savedAt)} ${formatTime(q.data.savedAt)}`,
            })}
          </Text>
        </View>
      )}
      {q.loading && !q.data ? (
        <ListSkeleton rows={3} />
      ) : q.error && !q.data ? (
        <ErrorView message={q.error} onRetry={q.refresh} />
      ) : list.length ? (
        <View style={{ gap: space.lg, marginTop: space.md }}>
          {list.map((t, i) => (
            // Only the next event shows its QR up front; others show it on the event page,
            // which can't load offline, so then every upcoming ticket shows its QR.
            <TicketCard key={t.id} ticket={t} showQR={tab === 'upcoming' && (i === 0 || offline)} />
          ))}
        </View>
      ) : (
        <EmptyState
          icon="ticket-outline"
          title={tab === 'upcoming' ? t('No upcoming tickets') : t('No past events yet')}
          body={tab === 'upcoming' ? t('Find something fun on Discover and sign up in one tap.') : undefined}
          action={
            tab === 'upcoming' ? (
              <Button title={t('Discover events')} variant="secondary" onPress={() => router.navigate('/discover')} />
            ) : undefined
          }
        />
      )}
    </ScrollView>
  );
}
