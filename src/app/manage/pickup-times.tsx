import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateTimeField } from '@/components/DateTimeField';
import { slotWhen } from '@/components/ShopParts';
import { toast } from '@/components/Toast';
import { Banner, Button, EmptyState, ErrorView, Field, Icon, Loading, Pill, Sheet } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { slotState } from '@/lib/commerce';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { radius, space, useColors } from '@/lib/theme';
import type { PickupSlot } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

type Draft = { id?: string; startsAt: Date; endsAt: Date; location: string; capacity: string };

const HOUR = 3600_000;

/**
 * When and where the committee hands out orders. Buyers book one at checkout,
 * so the desk knows who's coming and can pack bags in advance. A cap keeps a
 * lunch-hour slot from turning into a queue.
 */
export default function PickupTimes() {
  const { societyId } = useLocalSearchParams<{ societyId: string }>();
  const c = useColors();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery(() => api.listPickupSlots(societyId), [societyId]);

  if (q.loading && !q.data) return <Loading />;
  if (q.error && !q.data) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const slots = q.data ?? [];
  const upcoming = slots.filter((s) => slotState(s).key !== 'past');
  const past = slots.filter((s) => slotState(s).key === 'past');

  const newDraft = (): Draft => {
    // Next weekday lunchtime, or a week after the last time, same place.
    const last = upcoming[upcoming.length - 1];
    if (last) {
      return {
        startsAt: new Date(new Date(last.starts_at).getTime() + 7 * 24 * HOUR),
        endsAt: new Date(new Date(last.ends_at).getTime() + 7 * 24 * HOUR),
        location: last.location,
        capacity: last.capacity ? String(last.capacity) : '',
      };
    }
    const start = new Date(new Date().getTime() + 2 * 24 * HOUR);
    start.setMinutes(0, 0, 0);
    return { startsAt: start, endsAt: new Date(start.getTime() + HOUR), location: '', capacity: '' };
  };

  const edit = (s: PickupSlot) =>
    setDraft({
      id: s.id,
      startsAt: new Date(s.starts_at),
      endsAt: new Date(s.ends_at),
      location: s.location,
      capacity: s.capacity ? String(s.capacity) : '',
    });

  const capN = draft?.capacity.trim() ? Math.floor(Number(draft.capacity)) : null;
  const capError = capN != null && !(capN >= 1 && capN <= 2000) ? t('Between 1 and 2000, or empty for no cap') : null;
  const timeError = draft && draft.endsAt <= draft.startsAt ? t('The end must be after the start') : null;
  const valid = !!draft && draft.location.trim().length >= 2 && !capError && !timeError;
  const editing = draft?.id ? slots.find((s) => s.id === draft.id) : undefined;

  const save = async () => {
    if (!draft || !valid) return;
    if (editing?.booked) {
      const moved =
        editing.starts_at !== draft.startsAt.toISOString() ||
        editing.ends_at !== draft.endsAt.toISOString() ||
        editing.location !== draft.location.trim();
      if (
        moved &&
        !(await confirmAsync(
          t('Tell {n} buyers about the change?', { n: editing.booked }),
          t('Everyone booked on this time gets a notification with the new time and place.'),
          t('Save and tell them'),
        ))
      )
        return;
    }
    setBusy(true);
    try {
      await api.savePickupSlot({
        id: draft.id,
        society_id: societyId,
        starts_at: draft.startsAt.toISOString(),
        ends_at: draft.endsAt.toISOString(),
        location: draft.location.trim(),
        capacity: capN,
      });
      invalidate();
      setDraft(null);
      q.refresh();
      toast(t('Pickup time saved'));
    } catch (e) {
      showAlert(t('Could not save'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    const ok = await confirmAsync(
      t('Delete this pickup time?'),
      editing.booked
        ? t('{n} buyers booked it. They’ll be asked to choose another time.', { n: editing.booked })
        : t('No one has booked it yet.'),
      t('Delete'),
      true,
    );
    if (!ok) return;
    try {
      await api.deletePickupSlot(editing.id);
      invalidate();
      setDraft(null);
      q.refresh();
    } catch (e) {
      showAlert(t('Something went wrong'), errorMessage(e));
    }
  };

  const row = (s: PickupSlot) => {
    const st = slotState(s);
    return (
      <Pressable
        key={s.id}
        onPress={() => edit(s)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.fill : c.card }]}>
        <Icon name="calendar-outline" size={22} color={st.key === 'past' ? c.textTertiary : c.text} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: st.key === 'past' ? c.textSecondary : c.text, fontSize: 16, fontWeight: '600' }}>{slotWhen(s)}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 14 }} numberOfLines={1}>
            {s.location}
          </Text>
        </View>
        <Pill
          label={s.capacity ? `${s.booked ?? 0}/${s.capacity}` : t('{n} booked', { n: s.booked ?? 0 })}
          tone={st.key === 'full' ? 'warning' : 'neutral'}
          icon={st.key === 'full' ? 'alert-circle-outline' : 'people-outline'}
        />
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: t('Pickup times') }} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
        <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 20 }}>
          {t('Buyers pick one of these when they order, and get a reminder an hour before. Set a cap to spread people out.')}
        </Text>
        {upcoming.length ? (
          upcoming.map(row)
        ) : (
          <EmptyState
            icon="calendar-outline"
            title={t('No pickup times yet')}
            body={t('Without them, buyers only see the pickup note on each product.')}
          />
        )}
        {past.length > 0 && (
          <>
            <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600', marginTop: space.md }}>{t('Past')}</Text>
            {past.map(row)}
          </>
        )}
      </ScrollView>
      <View style={[styles.bottom, { backgroundColor: c.background, borderTopColor: c.border }]}>
        <Button icon="add" title={t('Add a pickup time')} onPress={() => setDraft(newDraft())} />
      </View>

      <Sheet visible={!!draft} onClose={() => setDraft(null)}>
        {draft && (
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
            <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>
              {draft.id ? t('Edit pickup time') : t('Add a pickup time')}
            </Text>
            <DateTimeField
              label={t('Starts')}
              value={draft.startsAt}
              onChange={(d) =>
                setDraft({ ...draft, startsAt: d, endsAt: new Date(d.getTime() + (draft.endsAt.getTime() - draft.startsAt.getTime())) })
              }
            />
            <DateTimeField
              label={t('Ends')}
              value={draft.endsAt}
              minimumDate={draft.startsAt}
              onChange={(d) => setDraft({ ...draft, endsAt: d })}
            />
            {timeError && <Text style={{ color: c.dangerText, fontSize: 13 }}>{timeError}</Text>}
            <Field
              label={t('Where')}
              value={draft.location}
              onChangeText={(location) => setDraft({ ...draft, location })}
              maxLength={120}
              placeholder={t('e.g. Room 1009, Ho Sin-Hang Engineering Building')}
            />
            <Field
              label={t('Cap')}
              hint={t('Most orders that can book this time. Empty for no cap.')}
              value={draft.capacity}
              onChangeText={(capacity) => setDraft({ ...draft, capacity })}
              keyboardType="number-pad"
              placeholder={t('No cap')}
              error={capError}
            />
            {!!editing?.booked && (
              <Banner icon="people-outline" text={t('{n} buyers booked this time. Changing it tells them.', { n: editing.booked })} />
            )}
            <Button title={t('Save')} loading={busy} disabled={!valid} onPress={save} />
            {draft.id && <Button variant="destructive" title={t('Delete pickup time')} disabled={busy} onPress={remove} />}
          </ScrollView>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.lg,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
