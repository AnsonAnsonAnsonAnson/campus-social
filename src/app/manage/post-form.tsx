import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { toast } from '@/components/Toast';
import { Button, Chip, ChipRow, Icon, Loading } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { showAlert } from '@/lib/dialog';
import { formatDay } from '@/lib/format';
import { t } from '@/lib/i18n';
import { pickAndUploadImage } from '@/lib/pickImage';
import { radius, space, useColors } from '@/lib/theme';
import type { PostEvent } from '@/lib/types';

const MAX_PHOTOS = 4;
const MAX_LENGTH = 2000;

/** Write or edit a society post. `eventId` starts a new post that promotes that event. */
export default function PostForm() {
  const { societyId, postId, eventId } = useLocalSearchParams<{ societyId: string; postId?: string; eventId?: string }>();
  const c = useColors();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [linked, setLinked] = useState<string | null>(eventId ?? null);
  const [pinned, setPinned] = useState(false);
  const [events, setEvents] = useState<PostEvent[]>([]);

  useEffect(() => {
    Promise.all([
      postId ? api.getPost(postId) : Promise.resolve(null),
      api.listEvents({ societyIds: [societyId], from: new Date().toISOString() }),
    ])
      .then(([post, upcoming]) => {
        setEvents(upcoming.filter((e) => e.status === 'published'));
        if (post) {
          setBody(post.body);
          setPhotos(post.image_urls);
          setLinked(post.event_id);
          setPinned(post.pinned);
          // Keep an older linked event selectable when editing.
          const old = post.event;
          if (old && !upcoming.some((e) => e.id === old.id)) setEvents((list) => [old, ...list]);
        }
      })
      .catch((e) => showAlert(t('Could not load'), errorMessage(e)))
      .finally(() => setLoading(false));
  }, [postId, societyId]);

  if (loading) return <Loading />;

  const addPhoto = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadImage([4, 3]);
      if (url) setPhotos((p) => [...p, url].slice(0, MAX_PHOTOS));
    } catch (e) {
      showAlert(t('Could not upload image'), errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.savePost({ id: postId, society_id: societyId, body: body.trim(), image_urls: photos, event_id: linked, pinned });
      invalidate();
      router.back();
      toast(postId ? t('Post updated') : t('Posted to your society page'));
    } catch (e) {
      showAlert(t('Could not post'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const left = MAX_LENGTH - body.length;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.group, { backgroundColor: c.card }]}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={t('Share news, photos or an event with your followers…')}
            placeholderTextColor={c.textTertiary}
            multiline
            maxLength={MAX_LENGTH}
            autoFocus={!postId}
            accessibilityLabel={t('Post')}
            style={[styles.input, { color: c.text }]}
          />
          {left < 200 && (
            <Text style={{ color: left < 20 ? c.dangerText : c.textSecondary, fontSize: 12, alignSelf: 'flex-end' }}>
              {t('{n} characters left', { n: left })}
            </Text>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {photos.map((u, i) => (
              <View key={u + i} style={[styles.thumb, { backgroundColor: c.fill }]}>
                <Image source={{ uri: u }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <Pressable
                  onPress={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  accessibilityRole="button"
                  accessibilityLabel={t('Remove photo')}
                  hitSlop={8}
                  style={styles.remove}>
                  <Icon name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <Pressable
                onPress={addPhoto}
                disabled={uploading}
                accessibilityRole="button"
                style={({ pressed }) => [styles.thumb, styles.add, { borderColor: c.border, opacity: pressed || uploading ? 0.6 : 1 }]}>
                <Icon name="image-outline" size={22} color={c.textSecondary} />
                <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>
                  {uploading ? t('Uploading…') : t('Add photo')}
                </Text>
              </Pressable>
            )}
          </ScrollView>
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('Up to {n} photos.', { n: MAX_PHOTOS })}</Text>
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={[styles.label, { color: c.textSecondary }]}>{t('Promote an event')}</Text>
          {events.length ? (
            <ChipRow>
              <Chip label={t('None')} selected={!linked} onPress={() => setLinked(null)} />
              {events.map((e) => (
                <Chip
                  key={e.id}
                  label={`${formatDay(e.starts_at)} · ${e.title}`}
                  selected={linked === e.id}
                  onPress={() => setLinked(e.id)}
                />
              ))}
            </ChipRow>
          ) : (
            <Text style={{ color: c.textSecondary, fontSize: 14 }}>{t('No upcoming events to link yet.')}</Text>
          )}
        </View>

        <View style={[styles.group, { backgroundColor: c.card }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.text, fontSize: 16 }}>{t('Pin to top of page')}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('Replaces any post that is pinned now.')}</Text>
            </View>
            <Switch value={pinned} onValueChange={setPinned} trackColor={{ true: c.tint }} />
          </View>
        </View>

        <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 18 }}>
          {t('Posts appear on your society page for every student and can be reported. Keep them about your society.')}
        </Text>
        <Button title={postId ? t('Save changes') : t('Publish')} loading={busy} disabled={!body.trim() || uploading} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  input: { minHeight: 140, fontSize: 17, lineHeight: 24, textAlignVertical: 'top', padding: 0 },
  label: { fontSize: 13, fontWeight: '600' },
  thumb: { width: 88, height: 88, borderRadius: radius.md, overflow: 'hidden' },
  add: { alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1.5, borderStyle: 'dashed' },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
