// Pieces shared by the shop screens: quantity stepper, pickup time picker,
// size guide table, pre-order goal and the floating bag bar.
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bagCount, useBag } from '@/lib/bag';
import { parseSizeChart, slotState } from '@/lib/commerce';
import { formatHkd } from '@/lib/fps';
import { formatDay, formatLongDay, formatTime, formatWhen } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';
import type { PickupSlot } from '@/lib/types';
import { t } from '@/lib/i18n';

import { Button, Icon, ProgressBar } from './ui';

export function Stepper({
  value,
  onChange,
  disabled,
  max,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  /** Stops "+" here. */
  max?: number;
  label: string;
}) {
  const c = useColors();
  const btn = (delta: number, icon: 'remove' | 'add') => {
    const off = disabled || (delta < 0 ? value <= 0 : max != null && value >= max);
    return (
      <Pressable
        onPress={() => onChange(value + delta)}
        disabled={off}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`${delta > 0 ? t('Add') : t('Remove')} ${label}`}
        style={({ pressed }) => [styles.stepBtn, { backgroundColor: c.fill, opacity: off ? 0.4 : pressed ? 0.7 : 1 }]}>
        <Icon name={icon} size={18} color={c.text} />
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      {btn(-1, 'remove')}
      <Text style={[styles.stepValue, { color: c.text }]} accessibilityLabel={`${label} ${value}`}>
        {value}
      </Text>
      {btn(1, 'add')}
    </View>
  );
}

/** "Thu 13 Nov · 1:00–2:00pm" */
export function slotWhen(s: PickupSlot) {
  return formatWhen(s.starts_at, s.ends_at);
}

/** Pickup times as a list of cards; full and past ones can't be picked. */
export function SlotPicker({ slots, value, onChange }: { slots: PickupSlot[]; value: string | null; onChange: (id: string) => void }) {
  const c = useColors();
  return (
    <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
      {slots.map((s) => {
        const st = slotState(s);
        const selected = value === s.id;
        const off = st.key !== 'open' && !selected;
        return (
          <Pressable
            key={s.id}
            onPress={() => onChange(s.id)}
            disabled={off}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: off }}
            style={({ pressed }) => [
              styles.slot,
              {
                backgroundColor: c.card,
                borderColor: selected ? c.tint : c.border,
                borderWidth: selected ? 2 : StyleSheet.hairlineWidth * 2,
                opacity: off ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}>
            <View style={[styles.slotDay, { backgroundColor: selected ? c.tintSoft : c.fill }]}>
              <Text style={{ color: selected ? c.tintText : c.accentText, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                {formatDay(s.starts_at)}
              </Text>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {formatTime(s.starts_at)}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }} numberOfLines={2}>
                {s.location}
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                {formatTime(s.starts_at)}–{formatTime(s.ends_at)}
                {st.key === 'full'
                  ? ` · ${t('Full')}`
                  : st.key === 'past'
                    ? ` · ${t('Passed')}`
                    : st.left != null && st.left <= 5
                      ? ` · ${t('{n} left', { n: st.left })}`
                      : ''}
              </Text>
            </View>
            <Icon
              name={selected ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={selected ? c.tint : off ? c.disabledText : c.textTertiary}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/** The size guide as a table. Returns null when there isn't one. */
export function SizeChart({ text }: { text: string | null }) {
  const c = useColors();
  const chart = parseSizeChart(text);
  if (!chart) return null;
  const row = (cells: string[], head: boolean, key: string | number) => (
    <View key={key} style={[styles.chartRow, !head && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
      {cells.map((cell, i) => (
        <Text
          key={i}
          style={{
            flex: i === 0 ? 0.8 : 1,
            color: head ? c.textSecondary : c.text,
            fontSize: head ? 12 : 15,
            fontWeight: head || i === 0 ? '600' : '400',
            textAlign: i === 0 ? 'left' : 'right',
            fontVariant: ['tabular-nums'],
          }}>
          {cell}
        </Text>
      ))}
    </View>
  );
  return (
    <View style={[styles.chart, { backgroundColor: c.card }]} accessibilityLabel={t('Size guide')}>
      {row(chart.header, true, 'h')}
      {chart.rows.map((r, i) => row(r, false, i))}
    </View>
  );
}

/** Pre-order goal: "32 of 40 ordered", with the expected ready date. */
export function GoalMeter({ ordered, goal, readyOn }: { ordered: number; goal: number | null; readyOn: string | null }) {
  const c = useColors();
  if (!goal && !readyOn) return null;
  const reached = !!goal && ordered >= goal;
  return (
    <View style={[styles.goal, { backgroundColor: c.fill }]}>
      {!!goal && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>
              {reached ? t('Goal reached, it’s happening') : t('{n} of {goal} ordered', { n: ordered, goal })}
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] }}>
              {Math.min(100, Math.round((ordered / goal) * 100))}%
            </Text>
          </View>
          <ProgressBar value={ordered / goal} tone={reached ? 'success' : 'warning'} />
          {!reached && (
            <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 18 }}>
              {t('Made once {goal} are ordered. If the goal isn’t reached, the society cancels and refunds every order.', { goal })}
            </Text>
          )}
        </>
      )}
      {!!readyOn && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="cube-outline" size={16} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('Expected {date}', { date: formatLongDay(readyOn) })}</Text>
        </View>
      )}
    </View>
  );
}

/** Floating "View bag" bar on shop screens once something is in the bag. */
export function BagBar({ societyId, total }: { societyId: string; total?: number }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const bag = useBag(societyId);
  const n = bagCount(bag);
  if (!n) return null;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.md), backgroundColor: c.elevated, borderTopColor: c.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: '600' }}>{t('{n} items in your bag', { n })}</Text>
        {total != null && <Text style={{ color: c.textSecondary, fontSize: 13 }}>{formatHkd(total)}</Text>}
      </View>
      <Button
        title={t('View bag')}
        icon="bag-handle-outline"
        onPress={() => router.push({ pathname: '/shop/bag', params: { societyId } })}
        style={{ minWidth: 150 }}
      />
    </View>
  );
}

export const shopStyles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

const styles = StyleSheet.create({
  stepBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 17, fontWeight: '600', minWidth: 22, textAlign: 'center', fontVariant: ['tabular-nums'] },
  slot: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg },
  slotDay: { width: 92, paddingVertical: 6, borderRadius: radius.md, alignItems: 'center', gap: 1 },
  chart: { borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.xs },
  chartRow: { flexDirection: 'row', gap: space.sm, paddingVertical: 8 },
  goal: { borderRadius: radius.lg, padding: space.md, gap: space.sm },
  bar: shopStyles.bar,
});
