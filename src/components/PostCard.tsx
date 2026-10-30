import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActionSheetIOS,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VerifiedBadge } from '@/components/Glyph';
import { toast } from '@/components/Toast';
import { Artwork, Icon, type IconName, Sheet, SocietyAvatar, tap } from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { compactNumber, formatAgo, formatWhen } from '@/lib/format';
import { t } from '@/lib/i18n';
import { radius, space, useColors } from '@/lib/theme';
import type { SocietyPost } from '@/lib/types';

type Option = { text: string; icon: IconName; onPress: () => void; destructive?: boolean };

export const sharePost = (p: SocietyPost) =>
  Share.share({ message: `${p.society.name}: ${p.body.slice(0, 140)}\n${Linking.createURL(`/post/${p.id}`)}` });

/**
 * A society's post: who posted and when, the text, up to four photos, the event it
 * promotes, then like and share. `canManage` swaps Report for Edit, Pin and Delete.
 */
export function PostCard({
  post,
  liked: likedInitially,
  canManage,
  showSociety = true,
}: {
  post: SocietyPost;
  liked: boolean;
  canManage: boolean;
  /** Off on the society's own page, where the header already names it. */
  showSociety?: boolean;
}) {
  const c = useColors();
  const { requireSignIn } = useAuth();
  const [liked, setLiked] = useState(likedInitially);
  const [likes, setLikes] = useState(post.like_count);
  const [expanded, setExpanded] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const long = post.body.length > 280 || post.body.split('\n').length > 6;
  const s = post.society;

  const toggleLike = () => {
    if (!requireSignIn()) return;
    tap();
    const next = !liked;
    setLiked(next);
    setLikes((n) => Math.max(n + (next ? 1 : -1), 0));
    api.setPostLiked(post.id, next).catch((e) => {
      setLiked(!next);
      setLikes((n) => Math.max(n + (next ? -1 : 1), 0));
      toast(errorMessage(e), { tone: 'error' });
    });
  };

  const run = (fn: () => Promise<void>, done: string) =>
    fn()
      .then(() => {
        invalidate();
        toast(done);
      })
      .catch((e) => showAlert(t('Could not update'), errorMessage(e)));

  const options: Option[] = canManage
    ? [
        {
          text: t('Edit post'),
          icon: 'create-outline',
          onPress: () => router.push({ pathname: '/manage/post-form', params: { societyId: post.society_id, postId: post.id } }),
        },
        post.pinned
          ? { text: t('Unpin from top'), icon: 'pin-outline', onPress: () => run(() => api.setPostPinned(post.id, false), t('Unpinned')) }
          : {
              text: t('Pin to top of page'),
              icon: 'pin-outline',
              onPress: () => run(() => api.setPostPinned(post.id, true), t('Pinned to the top')),
            },
        { text: t('Share'), icon: 'share-outline', onPress: () => sharePost(post) },
        {
          text: t('Delete post'),
          icon: 'trash-outline',
          destructive: true,
          onPress: async () => {
            const ok = await confirmAsync(t('Delete this post?'), t('It disappears from your page for everyone.'), t('Delete'), true);
            if (ok) run(() => api.deletePost(post.id), t('Post deleted'));
          },
        },
      ]
    : [
        { text: t('Share'), icon: 'share-outline', onPress: () => sharePost(post) },
        {
          text: t('Report post'),
          icon: 'flag-outline',
          destructive: true,
          onPress: () =>
            requireSignIn() && router.push({ pathname: '/report', params: { type: 'post', id: post.id, name: post.body.slice(0, 60) } }),
        },
      ];
  const more = () => {
    if (Platform.OS !== 'ios') return setMenu(true);
    const destructive = options.findIndex((o) => o.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...options.map((o) => o.text), t('Cancel')],
        cancelButtonIndex: options.length,
        destructiveButtonIndex: destructive < 0 ? undefined : destructive,
      },
      (i) => options[i]?.onPress(),
    );
  };

  return (
    <View style={[styles.card, { borderColor: c.border }]}>
      {post.removed_at && (
        <View style={[styles.notice, { backgroundColor: c.dangerSoft }]}>
          <Icon name="eye-off-outline" size={15} color={c.dangerText} />
          <Text style={{ color: c.dangerText, fontSize: 13, fontWeight: '600', flex: 1 }}>
            {t('Taken down by moderators. Only your committee can see it.')}
          </Text>
        </View>
      )}
      {post.pinned && (
        <View style={styles.pinned}>
          <Icon name="pin" size={13} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>{t('Pinned')}</Text>
        </View>
      )}

      <View style={styles.head}>
        <Pressable
          onPress={showSociety ? () => router.push(`/society/${s.id}`) : undefined}
          disabled={!showSociety}
          accessibilityRole={showSociety ? 'link' : undefined}
          style={styles.who}>
          <SocietyAvatar name={s.name} uri={s.logo_url} size={40} category={s.category} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
                {s.short_name ?? s.name}
              </Text>
              {s.verified && <VerifiedBadge size={15} color={c.tint} />}
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>
              {formatAgo(post.created_at)}
              {post.edited_at ? ` · ${t('Edited')}` : ''}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={more} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('More options')} style={styles.iconHit}>
          <Icon name="ellipsis-horizontal" size={20} color={c.textSecondary} />
        </Pressable>
      </View>

      <Pressable onPress={() => setExpanded((e) => !e)} disabled={!long}>
        <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }} numberOfLines={expanded || !long ? undefined : 6}>
          {post.body}
        </Text>
        {long && !expanded && <Text style={{ color: c.textSecondary, fontSize: 15, fontWeight: '600', marginTop: 2 }}>{t('More')}</Text>}
      </Pressable>

      {post.image_urls.length > 0 && <PhotoGrid urls={post.image_urls} onOpen={setViewing} />}

      {post.event && (
        <Pressable
          onPress={() => router.push(`/event/${post.event!.id}`)}
          accessibilityRole="link"
          style={({ pressed }) => [styles.event, { backgroundColor: pressed ? c.fillStrong : c.fill }]}>
          <Artwork seed={post.event.id} uri={post.event.cover_url} category={post.event.category} style={styles.eventArt} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ color: c.accentText, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
              {post.event.status === 'cancelled' ? t('Event cancelled') : formatWhen(post.event.starts_at)}
            </Text>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
              {post.event.title}
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={1}>
              {post.event.location}
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color={c.textTertiary} />
        </Pressable>
      )}

      <View style={styles.actions}>
        <Pressable
          onPress={toggleLike}
          disabled={!!post.removed_at}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={liked ? t('Unlike') : t('Like')}
          accessibilityState={{ selected: liked }}
          style={styles.action}>
          <Icon name={liked ? 'heart' : 'heart-outline'} size={21} color={liked ? c.danger : c.textSecondary} />
          {likes > 0 && (
            <Text style={{ color: liked ? c.danger : c.textSecondary, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
              {compactNumber(likes)}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => sharePost(post)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('Share')}
          style={styles.action}>
          <Icon name="share-outline" size={20} color={c.textSecondary} />
        </Pressable>
      </View>

      <PhotoViewer urls={post.image_urls} index={viewing} onClose={() => setViewing(null)} />
      <Sheet visible={menu} onClose={() => setMenu(false)}>
        {options.map((o) => (
          <Pressable
            key={o.text}
            accessibilityRole="button"
            onPress={() => {
              setMenu(false);
              o.onPress();
            }}
            style={({ pressed }) => [styles.menuRow, { borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 }]}>
            <Icon name={o.icon} size={20} color={o.destructive ? c.dangerText : c.text} />
            <Text style={{ color: o.destructive ? c.dangerText : c.text, fontSize: 17 }}>{o.text}</Text>
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

/** One wide photo; two side by side; three as one big and two stacked; four in a grid. */
function PhotoGrid({ urls, onOpen }: { urls: string[]; onOpen: (i: number) => void }) {
  const c = useColors();
  const tile = (i: number, style: object) => (
    <Pressable
      key={i}
      onPress={() => onOpen(i)}
      accessibilityRole="imagebutton"
      accessibilityLabel={t('Photo {n} of {total}', { n: i + 1, total: urls.length })}
      style={[{ backgroundColor: c.fill, overflow: 'hidden' }, style]}>
      <Image source={{ uri: urls[i] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
    </Pressable>
  );
  if (urls.length === 1) return <View style={styles.photos}>{tile(0, { aspectRatio: 4 / 3 })}</View>;
  if (urls.length === 2)
    return (
      <View style={[styles.photos, styles.photoRow]}>
        {tile(0, { flex: 1, aspectRatio: 0.8 })}
        {tile(1, { flex: 1, aspectRatio: 0.8 })}
      </View>
    );
  if (urls.length === 3)
    return (
      <View style={[styles.photos, styles.photoRow, { aspectRatio: 4 / 3 }]}>
        {tile(0, { flex: 2 })}
        <View style={{ flex: 1, gap: 3 }}>
          {tile(1, { flex: 1 })}
          {tile(2, { flex: 1 })}
        </View>
      </View>
    );
  return (
    <View style={[styles.photos, { gap: 3 }]}>
      <View style={styles.photoRow}>
        {tile(0, { flex: 1, aspectRatio: 1 })}
        {tile(1, { flex: 1, aspectRatio: 1 })}
      </View>
      <View style={styles.photoRow}>
        {tile(2, { flex: 1, aspectRatio: 1 })}
        {tile(3, { flex: 1, aspectRatio: 1 })}
      </View>
    </View>
  );
}

/** Full-screen photos, swipe between them. */
function PhotoViewer({ urls, index, onClose }: { urls: string[]; index: number | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible={index != null} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.viewer}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentOffset={{ x: (index ?? 0) * width, y: 0 }}>
          {urls.map((u, i) => (
            <Image
              key={i}
              source={{ uri: u }}
              style={{ width, height }}
              resizeMode="contain"
              accessibilityLabel={t('Photo {n} of {total}', { n: i + 1, total: urls.length })}
            />
          ))}
        </ScrollView>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('Close')}
          hitSlop={12}
          style={[styles.close, { top: insets.top + space.md }]}>
          <Icon name="close" size={22} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space.lg, paddingHorizontal: space.lg, gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: space.sm, borderRadius: radius.sm },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: -4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconHit: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  photos: { borderRadius: 14, overflow: 'hidden' },
  photoRow: { flexDirection: 'row', gap: 3 },
  event: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: 10, borderRadius: 14 },
  eventArt: { width: 48, height: 48, borderRadius: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xl, marginTop: -2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  close: {
    position: 'absolute',
    right: space.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
