import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from 'react-native';

import { toast } from '@/components/Toast';
import { Banner, Button, ErrorView, Field, Loading } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { todayHK } from '@/lib/format';
import { space, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** CUHK's society year runs September to August. */
function defaultYear() {
  const today = todayHK();
  const y = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 9 ? 1 : 0);
  return { name: `${y}–${String(y + 1).slice(2)}`, from: today, until: `${y + 1}-08-31` };
}

export default function PlanForm() {
  const { societyId, planId } = useLocalSearchParams<{ societyId: string; planId?: string }>();
  const c = useColors();

  const q = useQuery(async () => {
    const [plans, memberships] = await Promise.all([
      api.listPlans(societyId),
      planId ? api.listMemberships(societyId) : Promise.resolve([]),
    ]);
    return { plan: plans.find((p) => p.id === planId) ?? null, members: memberships.filter((m) => m.plan_id === planId).length };
  }, [societyId, planId]);

  const year = defaultYear();
  const [name, setName] = useState(t('Membership {year}', { year: year.name }));
  const [price, setPrice] = useState('');
  const [from, setFrom] = useState(year.from);
  const [until, setUntil] = useState(year.until);
  const [questions, setQuestions] = useState<string[]>(['']);
  const [autoApprove, setAutoApprove] = useState(true);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = q.data?.plan;
    if (!p) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setName(p.name);
    setPrice(p.price_hkd ? String(p.price_hkd) : '');
    setFrom(p.valid_from);
    setUntil(p.valid_until);
    setQuestions(p.questions.length ? p.questions : ['']);
    setAutoApprove(p.auto_approve);
    setOpen(p.is_open);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [q.data?.plan]);

  if (q.loading && !q.data) return <Loading />;
  if (q.error && !q.data) return <ErrorView message={q.error} onRetry={q.refresh} />;

  const amount = price.trim() ? Number(price) : 0;
  const priceError =
    price.trim() && (!Number.isFinite(amount) || amount < 0 || amount > 5000) ? t('Enter an amount in HK$, like 50') : null;
  const fromError = !DATE.test(from) ? t('Use the format YYYY-MM-DD') : null;
  const untilError = !DATE.test(until) ? t('Use the format YYYY-MM-DD') : until < from ? t('Must be after the start date') : null;
  const valid = name.trim().length >= 2 && !priceError && !fromError && !untilError;

  const save = async () => {
    setBusy(true);
    try {
      await api.savePlan({
        id: planId,
        society_id: societyId,
        name: name.trim(),
        price_hkd: amount,
        valid_from: from,
        valid_until: until,
        questions: questions.map((s) => s.trim()).filter(Boolean),
        // Paid plans always wait for the committee to see the payment.
        auto_approve: amount === 0 && autoApprove,
        is_open: open,
      });
      invalidate();
      router.back();
      toast(planId ? t('Changes saved') : t('Plan created. Students can join from your society page.'));
    } catch (e) {
      showAlert(t('Could not save plan'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmAsync(t('Delete this plan?'), t('No one has joined it yet, so nothing else changes.'), t('Delete'), true);
    if (!ok || !planId) return;
    try {
      await api.deletePlan(planId);
      invalidate();
      router.back();
      toast(t('Plan deleted'));
    } catch (e) {
      showAlert(t('Something went wrong'), errorMessage(e));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: planId ? t('Edit plan') : t('New membership plan') }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Field label={t('Name')} value={name} onChangeText={setName} maxLength={60} />
        <Field
          label={t('Fee (HK$)')}
          hint={t('Leave empty for a free membership')}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          placeholder="0"
          error={priceError}
        />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field
              label={t('Valid from')}
              value={from}
              onChangeText={setFrom}
              placeholder="2026-09-01"
              autoCapitalize="none"
              error={fromError}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label={t('Valid until')}
              value={until}
              onChangeText={setUntil}
              placeholder="2027-08-31"
              autoCapitalize="none"
              error={untilError}
            />
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600' }}>{t('Extra questions (optional)')}</Text>
          {questions.map((qu, i) => (
            <Field
              key={i}
              label={t('Question {n}', { n: i + 1 })}
              value={qu}
              onChangeText={(v) => setQuestions((all) => all.map((x, j) => (j === i ? v : x)))}
              placeholder={i === 0 ? t('e.g. Dietary needs for the welcome dinner') : undefined}
              maxLength={120}
            />
          ))}
          {questions.length < 3 && questions[questions.length - 1]?.trim() !== '' && (
            <Button small variant="plain" icon="add" title={t('Add a question')} onPress={() => setQuestions((all) => [...all, ''])} />
          )}
        </View>

        <View style={{ gap: space.md }}>
          {amount === 0 && <Toggle label={t('Approve new members automatically')} value={autoApprove} onChange={setAutoApprove} />}
          <Toggle label={t('Open for sign-ups')} value={open} onChange={setOpen} />
        </View>

        {amount > 0 && (
          <Banner
            icon="information-circle-outline"
            text={t('Members pay your society by FPS, PayMe or cash. You approve each one after checking the payment arrived.')}
          />
        )}
        {!planId && (
          <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {t('If you have current members, they’ll get a notification asking them to renew.')}
          </Text>
        )}

        <Button title={planId ? t('Save changes') : t('Create plan')} loading={busy} disabled={!valid} onPress={save} />
        {planId &&
          (q.data!.members === 0 ? (
            <Button title={t('Delete plan')} variant="destructive" disabled={busy} onPress={remove} />
          ) : (
            <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>
              {t('{n} people are on this plan, so it can’t be deleted. Turn off sign-ups instead.', { n: q.data!.members })}
            </Text>
          ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
      <Text style={{ color: c.text, fontSize: 16, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.tint }} />
    </View>
  );
}
