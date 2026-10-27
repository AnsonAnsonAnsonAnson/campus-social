import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { toast } from '@/components/Toast';
import { DateTimeField } from '@/components/DateTimeField';
import { Artwork, Button, Card, Field, Icon, Loading } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { pickAndUploadImage } from '@/lib/pickImage';
import { radius, space, useColors } from '@/lib/theme';
import type { EventWithSociety } from '@/lib/types';
import { showAlert } from '@/lib/dialog';
import { t } from '@/lib/i18n';

export default function Promote() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useColors();
  const [event, setEvent] = useState<EventWithSociety | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState(new Date());
  const [endsAt, setEndsAt] = useState(new Date());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getEvent(eventId).then((e) => {
      if (!e) return;
      setEvent(e);
      setTitle(e.title.slice(0, 80));
      setImage(e.cover_url);
      setEndsAt(new Date(e.starts_at));
    });
  }, [eventId]);

  if (!event) return <Loading />;

  const submit = async () => {
    setBusy(true);
    try {
      await api.requestBanner({
        society_id: event.society_id,
        event_id: event.id,
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        image_url: image,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      });
      invalidate();
      router.back();
      toast(t('Banner requested. The app team will review it shortly.'));
    } catch (e) {
      showAlert(t('Could not request banner'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={{ color: c.textSecondary, lineHeight: 20 }}>
            {t(
              'Banners appear at the top of Discover for every student. Requests are reviewed so the space stays useful. A wide image (3:2) works best.',
            )}
          </Text>
        </Card>

        <Pressable
          onPress={async () => {
            try {
              const url = await pickAndUploadImage([3, 2]);
              if (url) setImage(url);
            } catch (e) {
              showAlert(t('Could not upload image'), errorMessage(e));
            }
          }}>
          <Artwork seed={event.id} uri={image} category={event.category} style={styles.preview}>
            <View style={styles.scrim} />
            <View style={{ padding: space.lg }}>
              <Text style={styles.kicker}>{event.society.short_name ?? event.society.name}</Text>
              <Text style={styles.title} numberOfLines={2}>
                {title || t('Banner title')}
              </Text>
              {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            <View style={styles.editBadge}>
              <Icon name="image-outline" size={16} color="#fff" />
            </View>
          </Artwork>
        </Pressable>

        <Field label={t('Headline')} value={title} onChangeText={setTitle} maxLength={80} />
        <Field
          label={t('Subtitle')}
          value={subtitle}
          onChangeText={setSubtitle}
          maxLength={80}
          placeholder={t('Free tickets · Lee Hysan Hall')}
        />
        <View style={{ backgroundColor: c.card, borderRadius: radius.lg, padding: space.lg, gap: space.lg }}>
          <DateTimeField label={t('Show from')} value={startsAt} onChange={setStartsAt} />
          <DateTimeField label={t('Until')} value={endsAt} onChange={setEndsAt} minimumDate={startsAt} />
        </View>
        <Button
          title={t('Request banner')}
          icon="megaphone-outline"
          loading={busy}
          disabled={title.trim().length < 3 || endsAt <= startsAt}
          onPress={submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  preview: { height: 190, borderRadius: radius.lg, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.25)' },
  kicker: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  subtitle: { color: '#fff', fontSize: 15 },
  editBadge: { position: 'absolute', top: space.md, right: space.md, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, padding: 6 },
});
