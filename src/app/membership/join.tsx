import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { toast } from '@/components/Toast';
import { Button, Chip, ChipRow, ErrorView, Field, Icon, Loading, SegmentedControl, SocietyAvatar } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { studentIdFromEmail } from '@/lib/commerce';
import { COLLEGES } from '@/lib/constants';
import { showAlert } from '@/lib/dialog';
import { formatHkd } from '@/lib/fps';
import { formatLongDay } from '@/lib/format';
import { radius, space, type, useColors } from '@/lib/theme';
import type { PaymentMethod } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

/**
 * Join a society as a member. The form is filled from the profile, so students
 * give their details once instead of in every society's Google Form.
 */
export default function JoinSociety() {
  // `eventId`: joining to sign up for a members-only event; go back there once it's done.
  const { planId, societyId, eventId } = useLocalSearchParams<{ planId: string; societyId: string; eventId?: string }>();
  const c = useColors();
  const { user, profile, refreshProfile } = useAuth();
  const q = useQuery(async () => {
    const [society, plans, settings] = await Promise.all([
      api.getSociety(societyId),
      api.listPlans(societyId),
      api.getPaymentSettings(societyId),
    ]);
    return { society, plan: plans.find((p) => p.id === planId) ?? null, settings };
  }, [planId, societyId]);

  const [name, setName] = useState(profile?.display_name ?? '');
  const [sid, setSid] = useState(studentIdFromEmail(user?.email ?? ''));
  const [college, setCollege] = useState<string | null>(profile?.college ?? null);
  const [major, setMajor] = useState(profile?.major ?? '');
  const [phone, setPhone] = useState('');
  const [answers, setAnswers] = useState<string[]>([]);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [busy, setBusy] = useState(false);

  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const { society, plan, settings } = q.data!;
  if (!society || !plan) return <ErrorView message={t('This membership is not available')} />;

  const paid = plan.price_hkd > 0;
  const methods: { value: PaymentMethod; label: string }[] = [
    ...(settings?.fps_id ? [{ value: 'fps' as const, label: 'FPS 轉數快' }] : []),
    ...(settings?.payme_link ? [{ value: 'payme' as const, label: 'PayMe' }] : []),
    { value: 'cash', label: t('Cash at the booth') },
  ];
  const chosen = method ?? methods[0].value;
  const sidError = sid.trim() && !/^\d{10}$/.test(sid.trim()) ? t('A student ID has 10 digits') : null;
  const missing = !name.trim() ? t('Enter your full name') : sidError;

  const join = async () => {
    setBusy(true);
    try {
      const m = await api.joinSociety({
        plan_id: plan.id,
        full_name: name.trim(),
        student_id: sid.trim(),
        college: college ?? '',
        major: major.trim(),
        phone: phone.trim(),
        answers: plan.questions.map((_, i) => answers[i]?.trim() ?? ''),
        payment_method: paid ? chosen : null,
      });
      // First time someone gives a real name: keep it on their profile too.
      if (!profile?.display_name && name.trim()) {
        await api.updateProfile({ display_name: name.trim(), college: profile?.college ?? college });
        await refreshProfile();
      }
      invalidate();
      if (eventId && m.status === 'active') {
        router.replace(`/event/${eventId}`);
        toast(t("You're a member now. Sign up below."), { icon: 'card' });
      } else router.replace(`/membership/${m.id}`);
    } catch (e) {
      showAlert(t('Could not join'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: t('Join {society}', { society: society.short_name ?? society.name }) }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <SocietyAvatar name={society.name} uri={society.logo_url} category={society.category} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={[type.headline, { color: c.text }]}>{plan.name}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 14 }}>
              {paid ? formatHkd(plan.price_hkd) : t('Free')} · {t('Valid until {date}', { date: formatLongDay(plan.valid_until) })}
            </Text>
          </View>
        </View>

        <Field
          label={t('Full name')}
          value={name}
          onChangeText={setName}
          maxLength={80}
          autoComplete="name"
          hint={t('As on your student card.')}
        />
        <Field
          label={t('Student ID (optional)')}
          value={sid}
          onChangeText={setSid}
          keyboardType="number-pad"
          maxLength={10}
          error={sidError}
          valid={/^\d{10}$/.test(sid.trim())}
        />
        <View style={{ gap: 6 }}>
          <Text style={[type.label, { color: c.textSecondary }]}>{t('College')}</Text>
          <View style={{ marginHorizontal: -space.lg }}>
            <ChipRow>
              {COLLEGES.map((col) => (
                <Chip key={col} label={t(col)} selected={college === col} onPress={() => setCollege(col === college ? null : col)} />
              ))}
            </ChipRow>
          </View>
        </View>
        <Field label={t('Major (optional)')} value={major} onChangeText={setMajor} maxLength={80} />
        <Field label={t('Phone (optional)')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={30} />
        {plan.questions.map((question, i) => (
          <Field
            key={i}
            label={question}
            value={answers[i] ?? ''}
            maxLength={200}
            onChangeText={(v) =>
              setAnswers((a) => {
                const next = [...a];
                next[i] = v;
                return next;
              })
            }
          />
        ))}

        {paid && (
          <View style={{ gap: 6 }}>
            <Text style={[type.label, { color: c.textSecondary }]}>{t('How will you pay?')}</Text>
            <SegmentedControl grey options={methods} value={chosen} onChange={setMethod} />
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.fill }}>
          <Icon name="lock-closed-outline" size={18} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19, flex: 1 }}>
            {t(
              '{society} will see these details to keep its member list and send it to the Office of Student Affairs. Other students only see your name. You can leave at any time.',
              { society: society.name },
            )}
          </Text>
        </View>

        <Button
          title={paid ? t('Join and pay {amount}', { amount: formatHkd(plan.price_hkd) }) : t('Join')}
          loading={busy}
          disabled={!!missing}
          hint={missing ?? undefined}
          onPress={join}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
