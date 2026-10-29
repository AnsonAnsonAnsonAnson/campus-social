import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { DateTimeField } from '@/components/DateTimeField';
import { toast } from '@/components/Toast';
import { Artwork, Button, Field, Icon, Loading } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { showAlert } from '@/lib/dialog';
import { t } from '@/lib/i18n';
import { pickAndUploadImage } from '@/lib/pickImage';
import { radius, space, useColors } from '@/lib/theme';

function defaultStart() {
  const d = new Date(Date.now() + 21 * 86400_000);
  d.setUTCHours(3, 0, 0, 0); // 11:00 in Hong Kong
  return d;
}

/**
 * Organise a fair (or edit one): when and where, and whether societies can still
 * ask for a booth. A new fair is listed once the app team approves it.
 */
export default function FairForm() {
  const { societyId, fairId } = useLocalSearchParams<{ societyId?: string; fairId?: string }>();
  const c = useColors();
  const [loading, setLoading] = useState(!!fairId);
  const [busy, setBusy] = useState(false);
  const [organiser, setOrganiser] = useState(societyId ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState(() => new Date(defaultStart().getTime() + 7 * 3600_000));
  const [presaleCloses, setPresaleCloses] = useState<Date | null>(null);
  const [boothsOpen, setBoothsOpen] = useState(true);

  useEffect(() => {
    if (!fairId) return;
    api
      .getFair(fairId)
      .then((f) => {
        if (!f) return;
        setOrganiser(f.organiser_society_id);
        setName(f.name);
        setDescription(f.description);
        setVenue(f.venue);
        setCoverUrl(f.cover_url);
        setStartsAt(new Date(f.starts_at));
        setEndsAt(new Date(f.ends_at));
        setPresaleCloses(f.presale_closes_at ? new Date(f.presale_closes_at) : null);
        setBoothsOpen(f.booths_open);
      })
      .catch((e) => showAlert(t('Could not load the fair'), errorMessage(e)))
      .finally(() => setLoading(false));
  }, [fairId]);

  if (loading) return <Loading />;

  const pickCover = async () => {
    try {
      const url = await pickAndUploadImage([16, 9]);
      if (url) setCoverUrl(url);
    } catch (e) {
      showAlert(t('Could not upload image'), errorMessage(e));
    }
  };

  const save = async () => {
    if (endsAt <= startsAt) {
      showAlert(t('Check the times'), t('The fair must end after it starts.'));
      return;
    }
    if (presaleCloses && presaleCloses > endsAt) {
      showAlert(t('Check the times'), t('Presale has to close before the fair ends.'));
      return;
    }
    setBusy(true);
    try {
      const id = await api.saveFair({
        id: fairId,
        organiser_society_id: organiser,
        name: name.trim(),
        description: description.trim(),
        venue: venue.trim(),
        cover_url: coverUrl,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        presale_closes_at: presaleCloses?.toISOString() ?? null,
        booths_open: boothsOpen,
      });
      invalidate();
      router.back();
      if (fairId) toast(t('Changes saved'));
      else {
        toast(t('Sent for review. We’ll tell you when it’s listed.'));
        router.push({ pathname: '/manage/fair', params: { fairId: id } });
      }
    } catch (e) {
      showAlert(t('Could not save the fair'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const valid = name.trim().length >= 2 && venue.trim().length >= 2;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: fairId ? t('Edit fair') : t('Organise a fair') }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={pickCover} accessibilityLabel={t('Choose cover image')}>
          <Artwork seed={fairId ?? name ?? 'fair'} uri={coverUrl} category="Social" style={styles.cover}>
            <View style={styles.coverHint}>
              <Icon name="image-outline" color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600' }}>{coverUrl ? t('Change cover') : t('Add cover image')}</Text>
            </View>
          </Artwork>
        </Pressable>

        <Field label={t('Name')} value={name} onChangeText={setName} maxLength={80} placeholder={t('Chung Chi Christmas Fair')} />
        <Field label={t('Where')} value={venue} onChangeText={setVenue} maxLength={120} placeholder={t('University Mall')} />
        <Field
          label={t('Description')}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={2000}
          placeholder={t('How many booths, what to expect, anything buyers should know.')}
        />

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
          <Toggle
            label={t('Close presale before the fair')}
            value={!!presaleCloses}
            onChange={(on) => setPresaleCloses(on ? new Date(startsAt.getTime() - 12 * 3600_000) : null)}
          />
          {presaleCloses && <DateTimeField label={t('Presale closes')} value={presaleCloses} onChange={setPresaleCloses} />}
          <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19, marginTop: -6 }}>
            {presaleCloses
              ? t('Booths get a final count the night before, so they know how much to make.')
              : t('Buyers can pre-pay until the fair ends, even from the queue.')}
          </Text>
        </View>

        <View style={[styles.group, { backgroundColor: c.card }]}>
          <Toggle label={t('Taking booth requests')} value={boothsOpen} onChange={setBoothsOpen} />
          <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19, marginTop: -6 }}>
            {t('Society admins ask for a booth from the fair page. You confirm each one and give it a booth number.')}
          </Text>
        </View>

        <Button
          title={fairId ? t('Save changes') : t('Send for review')}
          icon="paper-plane-outline"
          loading={busy}
          disabled={!valid || !organiser}
          onPress={save}
        />
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

const styles = StyleSheet.create({
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
});
