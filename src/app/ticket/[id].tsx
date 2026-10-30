import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TicketPass, ticketShowsQR } from '@/components/TicketCard';
import { ErrorView, Icon, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ticketsWithFallback } from '@/lib/ticketCache';
import { backupCode } from '@/lib/ticketToken';
import { palette, space } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

const BG = palette.neutral[900];

/** One ticket, full screen on a dark background, ready to hold up to the scanner. Works offline. */
export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [showCode, setShowCode] = useState(false);
  const q = useQuery(async () => {
    if (!user) return null;
    const { tickets } = await ticketsWithFallback(user.id, () => api.myTickets());
    return tickets.find((tk) => tk.id === id) ?? null;
  }, [user?.id, id]);
  const ticket = q.data;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/tickets'))}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('Close')}
          style={styles.round}>
          <Icon name="close" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.topTitle}>{t('Ticket')}</Text>
        <View style={{ width: 36 }} />
      </View>
      {q.loading && !q.data ? (
        <Loading />
      ) : !ticket ? (
        <ErrorView message={q.error ?? t('Ticket not found')} onRetry={q.refresh} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xxl, gap: space.lg }}>
          <TicketPass ticket={ticket} holder={profile?.display_name || user?.email || null} size="full" notch={BG} />
          {ticketShowsQR(ticket) && !ticket.checked_in_at && (
            <View style={{ gap: space.md }}>
              <View style={styles.tip}>
                <Icon name="sunny-outline" size={18} color="rgba(255,255,255,0.8)" />
                <Text style={styles.tipText}>
                  {t('Turn your brightness up. Screenshots won’t work at the door: the code changes every 30 seconds.')}
                </Text>
              </View>
              {showCode ? (
                <View style={styles.backup}>
                  <Text style={styles.backupLabel}>{t('Backup code')}</Text>
                  <Text style={styles.backupCode} selectable={false}>
                    {backupCode(ticket.ticket_code)}
                  </Text>
                  <Text style={[styles.tipText, { flex: 0, textAlign: 'center' }]}>
                    {t('Only if the scanner can’t read your phone: door staff can type this. Don’t share it.')}
                  </Text>
                </View>
              ) : (
                <Pressable onPress={() => setShowCode(true)} accessibilityRole="button" style={styles.link}>
                  <Icon name="keypad-outline" size={18} color="#fff" />
                  <Text style={styles.linkText}>{t('Can’t scan? Show backup code')}</Text>
                </Pressable>
              )}
            </View>
          )}
          <Pressable onPress={() => router.push(`/event/${ticket.event.id}`)} accessibilityRole="button" style={styles.link}>
            <Icon name="information-circle-outline" size={18} color="#fff" />
            <Text style={styles.linkText}>{t('Event details')}</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingBottom: space.sm },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 17, fontWeight: '700' },
  tip: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', paddingHorizontal: space.xs },
  tipText: { flex: 1, color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 18 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  linkText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  backup: { gap: space.sm, padding: space.lg, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
  backupLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  backupCode: { color: '#fff', fontSize: 30, fontWeight: '700', letterSpacing: 4, fontVariant: ['tabular-nums'] },
});
