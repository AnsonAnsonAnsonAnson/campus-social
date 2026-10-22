import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { DateTimeField } from '@/components/DateTimeField';
import { Artwork, Button, Chip, ChipRow, Field, Icon, Loading } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { EVENT_CATEGORIES } from '@/lib/constants';
import { pickAndUploadImage } from '@/lib/pickImage';
import { radius, space, useColors } from '@/lib/theme';
import type { EventInput, EventStatus } from '@/lib/types';

function defaultStart() {
  const d = new Date(Date.now() + 7 * 86400_000);
  d.setMinutes(0, 0, 0);
  return d;
}

export default function EventForm() {
  const { societyId, eventId } = useLocalSearchParams<{ societyId?: string; eventId?: string }>();
  const c = useColors();
  const [loading, setLoading] = useState(!!eventId);
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
  const [priceText, setPriceText] = useState('Free');
  const [status, setStatus] = useState<EventStatus>('draft');
  const [owner, setOwner] = useState(societyId ?? '');

  useEffect(() => {
    if (!eventId) return;
    api.getEvent(eventId).then((e) => {
      if (e) {
        setTitle(e.title);
        setDescription(e.description);
        setCategory(e.category);
        setLocation(e.location);
        setStartsAt(new Date(e.starts_at));
        setEndsAt(new Date(e.ends_at));
        setCoverUrl(e.cover_url);
        setRegistrationRequired(e.registration_required);
        setCapacity(e.capacity ? String(e.capacity) : '');
        setWaitlist(e.waitlist_enabled);
        setPriceText(e.price_text ?? '');
        setStatus(e.status);
        setOwner(e.society_id);
      }
      setLoading(false);
    });
  }, [eventId]);

  if (loading) return <Loading />;

  const pickCover = async () => {
    try {
      const url = await pickAndUploadImage([16, 9]);
      if (url) setCoverUrl(url);
    } catch (e) {
      Alert.alert('Could not upload image', errorMessage(e));
    }
  };

  const save = async (nextStatus: EventStatus) => {
    if (endsAt < startsAt) {
      Alert.alert('Check the times', 'The event must end after it starts.');
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
      registration_opens_at: null,
      registration_closes_at: null,
      price_text: priceText.trim() || null,
    };
    setBusy(true);
    try {
      const id = await api.saveEvent(input);
      invalidate();
      router.back();
      if (!eventId && nextStatus === 'published') router.push(`/event/${id}`);
    } catch (e) {
      Alert.alert('Could not save event', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cancelEvent = () =>
    Alert.alert('Cancel this event?', 'Everyone who registered will see it as cancelled. You can still edit it later.', [
      { text: 'Keep event', style: 'cancel' },
      { text: 'Cancel event', style: 'destructive', onPress: () => save('cancelled') },
    ]);

  const valid = title.trim().length >= 3 && location.trim().length > 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: eventId ? 'Edit event' : 'New event' }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={pickCover} accessibilityLabel="Choose cover image">
          <Artwork seed={eventId ?? title ?? 'new'} uri={coverUrl} style={styles.cover}>
            <View style={styles.coverHint}>
              <Icon name="image-outline" color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600' }}>{coverUrl ? 'Change cover' : 'Add cover image'}</Text>
            </View>
          </Artwork>
        </Pressable>

        <Field label="Title" value={title} onChangeText={setTitle} maxLength={140} placeholder="Sunrise hike: Lion Rock" />
        <Field label="Location" value={location} onChangeText={setLocation} placeholder="Building and room" />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={4000}
          placeholder="What should people expect? What should they bring?"
        />

        <Text style={styles.label(c.textSecondary)}>Category</Text>
        <ChipRow>
          {EVENT_CATEGORIES.map((cat) => (
            <Chip key={cat} label={cat} selected={category === cat} onPress={() => setCategory(cat)} />
          ))}
        </ChipRow>

        <View style={[styles.group, { backgroundColor: c.card }]}>
          <DateTimeField
            label="Starts"
            value={startsAt}
            onChange={(d) => {
              const length = endsAt.getTime() - startsAt.getTime();
              setStartsAt(d);
              setEndsAt(new Date(d.getTime() + Math.max(length, 3600_000)));
            }}
          />
          <DateTimeField label="Ends" value={endsAt} onChange={setEndsAt} minimumDate={startsAt} />
        </View>

        <View style={[styles.group, { backgroundColor: c.card }]}>
          <Toggle label="Require sign-up" value={registrationRequired} onChange={setRegistrationRequired} />
          {registrationRequired && (
            <>
              <Field
                label="Capacity"
                value={capacity}
                onChangeText={(t) => setCapacity(t.replace(/\D/g, ''))}
                keyboardType="number-pad"
                placeholder="Leave empty for unlimited"
              />
              <Toggle label="Waitlist when full" value={waitlist} onChange={setWaitlist} />
            </>
          )}
        </View>

        <Field
          label="Price"
          value={priceText}
          onChangeText={setPriceText}
          placeholder="Free / HK$50 at the door"
          hint="Payments are handled outside the app for now."
        />

        <View style={{ gap: space.sm }}>
          <Button
            title={status === 'published' ? 'Save changes' : 'Publish'}
            icon="paper-plane-outline"
            loading={busy}
            disabled={!valid}
            onPress={() => save(status === 'cancelled' ? 'cancelled' : 'published')}
          />
          {status === 'draft' && (
            <Button title="Save as draft" variant="secondary" disabled={!valid || busy} onPress={() => save('draft')} />
          )}
          {status === 'cancelled' && (
            <Button title="Reinstate event" variant="secondary" disabled={busy} onPress={() => save('published')} />
          )}
          {eventId && status === 'published' && <Button title="Cancel event" variant="plain" disabled={busy} onPress={cancelEvent} />}
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
