import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { DateTimeField } from '@/components/DateTimeField';
import { toast } from '@/components/Toast';
import { Artwork, Button, Chip, ChipRow, Field, Icon, Loading } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { EVENT_CATEGORIES } from '@/lib/constants';
import { pickAndUploadImage } from '@/lib/pickImage';
import { radius, space, useColors } from '@/lib/theme';
import type { EventInput, EventStatus } from '@/lib/types';
import { showAlert } from '@/lib/dialog';
import { t } from '@/lib/i18n';

const WEEK_MS = 7 * 86400_000;

function defaultStart() {
  const d = new Date(Date.now() + 7 * 86400_000);
  d.setMinutes(0, 0, 0);
  return d;
}

export default function EventForm() {
  // `copyFrom` prefills a new draft from an existing event, a week later.
  const { societyId, eventId, copyFrom } = useLocalSearchParams<{ societyId?: string; eventId?: string; copyFrom?: string }>();
  const c = useColors();
  const [loading, setLoading] = useState(!!(eventId || copyFrom));
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('Social');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState(() => new Date(defaultStart().getTime() + 2 * 3600_000));
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [registrationRequired, setRegistrationRequired] = useState(true);
  const [capacity, setCapacity] = useState('');
  const [waitlist, setWaitlist] = useState(true);
  const [priceText, setPriceText] = useState(() => t('Free'));
  const [question, setQuestion] = useState('');
  const [membersOnly, setMembersOnly] = useState(false);
  const [opensAt, setOpensAt] = useState<Date | null>(null);
  const [closesAt, setClosesAt] = useState<Date | null>(null);
  const [status, setStatus] = useState<EventStatus>('draft');
  const [owner, setOwner] = useState(societyId ?? '');

  useEffect(() => {
    const source = eventId ?? copyFrom;
    if (!source) return;
    api
      .getEvent(source)
      .then((e) => {
        if (!e) return;
        // A copy keeps the details and moves every date one week later.
        const shift = (iso: string) => new Date(new Date(iso).getTime() + (copyFrom ? WEEK_MS : 0));
        setTitle(e.title);
        setDescription(e.description);
        setCategory(e.category);
        setLocation(e.location);
        setStartsAt(shift(e.starts_at));
        setEndsAt(shift(e.ends_at));
        setCoverUrl(e.cover_url);
        setRegistrationRequired(e.registration_required);
        setCapacity(e.capacity ? String(e.capacity) : '');
        setWaitlist(e.waitlist_enabled);
        setPriceText(e.price_text ?? '');
        setQuestion(e.signup_question ?? '');
        setMembersOnly(e.members_only);
        setOpensAt(e.registration_opens_at ? shift(e.registration_opens_at) : null);
        setClosesAt(e.registration_closes_at ? shift(e.registration_closes_at) : null);
        setStatus(copyFrom ? 'draft' : e.status);
        setOwner(e.society_id);
      })
      .catch((e) => showAlert(t('Could not load event'), errorMessage(e)))
      .finally(() => setLoading(false));
  }, [eventId, copyFrom]);

  if (loading) return <Loading />;

  const pickCover = async () => {
    try {
      const url = await pickAndUploadImage([16, 9]);
      if (url) setCoverUrl(url);
    } catch (e) {
      showAlert(t('Could not upload image'), errorMessage(e));
    }
  };

  const save = async (nextStatus: EventStatus) => {
    if (endsAt < startsAt) {
      showAlert(t('Check the times'), t('The event must end after it starts.'));
      return;
    }
    if (registrationRequired && opensAt && opensAt >= (closesAt ?? startsAt)) {
      showAlert(t('Check the sign-up window'), t('Sign-up has to open before it closes and before the event starts.'));
      return;
    }
    const cap = parseInt(capacity, 10);
    const input: EventInput = {
      id: eventId,
      society_id: owner,
      title: title.trim(),
      description: description.trim(),
      category,
      location: location.trim(),
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      cover_url: coverUrl,
      status: nextStatus,
      registration_required: registrationRequired,
      capacity: registrationRequired && cap > 0 ? cap : null,
      waitlist_enabled: waitlist,
      registration_opens_at: registrationRequired && opensAt ? opensAt.toISOString() : null,
      registration_closes_at: registrationRequired && closesAt ? closesAt.toISOString() : null,
      price_text: priceText.trim() || null,
      signup_question: registrationRequired ? question.trim() || null : null,
      members_only: registrationRequired && membersOnly,
    };
    setBusy(true);
    try {
      const id = await api.saveEvent(input);
      invalidate();
      router.back();
      toast(
        nextStatus === 'draft'
          ? t('Draft saved')
          : nextStatus === 'cancelled'
            ? t('Event cancelled. Attendees have been told.')
            : eventId && status === 'published'
              ? t('Changes saved')
              : t('Event published'),
      );
      if (!eventId && nextStatus === 'published') router.push(`/event/${id}`);
    } catch (e) {
      showAlert(t('Could not save event'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cancelEvent = () =>
    showAlert(t('Cancel this event?'), t('Everyone who registered will see it as cancelled. You can still edit it later.'), [
      { text: t('Keep event'), style: 'cancel' },
      { text: t('Cancel event'), style: 'destructive', onPress: () => save('cancelled') },
    ]);

  const valid = title.trim().length >= 3 && location.trim().length > 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: eventId ? t('Edit event') : copyFrom ? t('Copy of event') : t('New event') }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={pickCover} accessibilityLabel={t('Choose cover image')}>
          <Artwork seed={eventId ?? title ?? 'new'} uri={coverUrl} category={category} style={styles.cover}>
            <View style={styles.coverHint}>
              <Icon name="image-outline" color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600' }}>{coverUrl ? t('Change cover') : t('Add cover image')}</Text>
            </View>
          </Artwork>
        </Pressable>

        <Field label={t('Title')} value={title} onChangeText={setTitle} maxLength={140} placeholder={t('Sunrise hike: Lion Rock')} />
        <Field label={t('Location')} value={location} onChangeText={setLocation} placeholder={t('Building and room')} />
        <Field
          label={t('Description')}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={4000}
          placeholder={t('What should people expect? What should they bring?')}
        />

        <Text style={styles.label(c.textSecondary)}>{t('Category')}</Text>
        <ChipRow>
          {EVENT_CATEGORIES.map((cat) => (
            <Chip key={cat} label={t(cat)} selected={category === cat} onPress={() => setCategory(cat)} />
          ))}
        </ChipRow>

        <View style={[styles.group, { backgroundColor: c.card }]}>
          <DateTimeField
            label={t('Starts')}
            value={startsAt}
            onChange={(d) => {
              const length = endsAt.getTime() - startsAt.getTime();
              setStartsAt(d);
              setEndsAt(new Date(d.getTime() + Math.max(length, 3600_000)));
            }}
          />
          <DateTimeField label={t('Ends')} value={endsAt} onChange={setEndsAt} minimumDate={startsAt} />
        </View>

        <View style={[styles.group, { backgroundColor: c.card }]}>
          <Toggle label={t('Require sign-up')} value={registrationRequired} onChange={setRegistrationRequired} />
          {registrationRequired && (
            <>
              <Field
                label={t('Capacity')}
                value={capacity}
                onChangeText={(t) => setCapacity(t.replace(/\D/g, ''))}
                keyboardType="number-pad"
                placeholder={t('Leave empty for unlimited')}
              />
              <Toggle label={t('Waitlist when full')} value={waitlist} onChange={setWaitlist} />
              <Toggle label={t('Members only')} value={membersOnly} onChange={setMembersOnly} />
              {membersOnly && (
                <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: -6 }}>
                  {t('Everyone can see the event; only current members and your committee can sign up.')}
                </Text>
              )}
              <Toggle
                label={t('Sign-up opens later')}
                value={!!opensAt}
                onChange={(on) => setOpensAt(on ? new Date(Math.min(Date.now() + 86400_000, startsAt.getTime() - 3600_000)) : null)}
              />
              {opensAt && <DateTimeField label={t('Opens')} value={opensAt} onChange={setOpensAt} />}
              <Toggle
                label={t('Close sign-up early')}
                value={!!closesAt}
                onChange={(on) => setClosesAt(on ? new Date(startsAt.getTime() - 86400_000) : null)}
              />
              {closesAt && <DateTimeField label={t('Closes')} value={closesAt} onChange={setClosesAt} />}
              <Field
                label={t('Question for attendees')}
                value={question}
                onChangeText={setQuestion}
                maxLength={200}
                placeholder={t('Optional, e.g. Any dietary needs?')}
                hint={t('Answers show in your attendee list and CSV export.')}
              />
            </>
          )}
        </View>

        <Field
          label={t('Price')}
          value={priceText}
          onChangeText={setPriceText}
          placeholder={t('Free / HK$50 at the door')}
          hint={t('Payments are handled outside the app for now.')}
        />

        <View style={{ gap: space.sm }}>
          <Button
            title={status === 'published' ? t('Save changes') : t('Publish')}
            icon="paper-plane-outline"
            loading={busy}
            disabled={!valid}
            onPress={() => save(status === 'cancelled' ? 'cancelled' : 'published')}
          />
          {status === 'draft' && (
            <Button title={t('Save as draft')} variant="secondary" disabled={!valid || busy} onPress={() => save('draft')} />
          )}
          {status === 'cancelled' && (
            <Button title={t('Reinstate event')} variant="secondary" disabled={busy} onPress={() => save('published')} />
          )}
          {eventId && status === 'published' && <Button title={t('Cancel event')} variant="plain" disabled={busy} onPress={cancelEvent} />}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: c.text, fontSize: 16 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.tint }} />
    </View>
  );
}

const styles = {
  ...StyleSheet.create({
    cover: { height: 180, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
    coverHint: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.4)',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
    },
    group: { borderRadius: radius.lg, padding: space.lg, gap: space.lg },
  }),
  label: (color: string) => ({ color, fontSize: 13, fontWeight: '600' as const, textTransform: 'uppercase' as const, marginBottom: -8 }),
};
