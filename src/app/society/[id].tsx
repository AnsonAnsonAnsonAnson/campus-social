import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';
import { ActionSheetIOS, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventRow } from '@/components/EventCard';
import { PostCard } from '@/components/PostCard';
import { ProductRow } from '@/components/ProductCard';
import { VerifiedBadge } from '@/components/Glyph';
import { FollowButton } from '@/components/SocietyRow';
import { StackTabBar } from '@/components/TabBar';
import {
  Artwork,
  Banner,
  Button,
  EmptyState,
  ErrorView,
  Icon,
  Loading,
  Pill,
  SectionHeader,
  SocietyAvatar,
  UnderlineTabs,
} from '@/components/ui';
import { toast } from '@/components/Toast';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { membershipState } from '@/lib/commerce';
import { showAlert } from '@/lib/dialog';
import { formatHkd } from '@/lib/fps';
import { compactNumber, formatLongDay, todayHK } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { t } from '@/lib/i18n';

export default function SocietyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { user, requireSignIn, hiddenIds, setHidden } = useAuth();
  const [picked, setTab] = useState<'posts' | 'upcoming' | 'past' | null>(null);
  const [expanded, setExpanded] = useState(false);
  const insets = useSafeAreaInsets();

  const q = useQuery(async () => {
    const now = new Date().toISOString();
    const [society, upcoming, past, mine, plans, products, memberships, posts] = await Promise.all([
      api.getSociety(id),
      api.listEvents({ societyIds: [id], from: now }),
      api.listEvents({ societyIds: [id], to: now }),
      api.mySocieties(),
      api.listPlans(id),
      api.listProducts(id),
      api.myMemberships(),
      api.listPosts(id),
    ]);
    const liked = new Set(await api.myLikedPostIds(posts.map((p) => p.id)));
    const today = todayHK();
    return {
      society,
      upcoming,
      past: past
        .filter((e) => e.ends_at < now)
        .reverse()
        .slice(0, 10),
      isCommittee: mine.some((s) => s.id === id),
      plan: plans.find((p) => p.is_open && p.valid_until >= today) ?? null,
      products: products.filter((p) => p.status === 'published'),
      membership: memberships.find((m) => m.society_id === id) ?? null,
      posts,
      liked,
    };
  }, [id, user?.id]);

  const shell = (body: ReactNode) => (
    <View style={{ flex: 1, backgroundColor: c.backgroundPlain }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1 }}>{body}</View>
      <StackTabBar current="societies" />
    </View>
  );
  if (q.loading) return shell(<Loading />);
  if (q.error) return shell(<ErrorView message={q.error} onRetry={q.refresh} />);
  const s = q.data?.society;
  if (!s) return shell(<ErrorView message={t('This society could not be found.')} />);
  const { plan, membership, products } = q.data!;

  const instagram = s.instagram?.replace(/^@/, '');
  const share = () => Share.share({ message: `${s.name}\n${Linking.createURL(`/society/${s.id}`)}` });
  const report = () => requireSignIn() && router.push({ pathname: '/report', params: { type: 'society', id: s.id, name: s.name } });
  const hidden = hiddenIds.has(s.id);
  const toggleHidden = () =>
    setHidden(s.id, !hidden)
      .then(() =>
        toast(
          hidden
            ? t('{name} is back in your feed', { name: s.short_name ?? s.name })
            : t('You won’t see {name} in Discover or your calendar', { name: s.short_name ?? s.name }),
        ),
      )
      .catch((e) => showAlert(t('Could not update'), errorMessage(e)));
  const more = () => {
    const options = [t('Share'), hidden ? t('Show this society again') : t('Hide this society'), t('Report society'), t('Cancel')];
    const run = (i: number) => (i === 0 ? share() : i === 1 ? toggleHidden() : i === 2 ? report() : undefined);
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 3, destructiveButtonIndex: 2 }, run);
    else
      showAlert(s.name, undefined, [
        { text: options[0], onPress: () => run(0) },
        { text: options[1], onPress: () => run(1) },
        { text: options[2], onPress: () => run(2) },
        { text: t('Cancel'), style: 'cancel' },
      ]);
  };

  const { posts, liked, isCommittee } = q.data!;
  // Open on the posts when there are any; a committee lands there to write the first one.
  const tab = picked ?? (posts.length || isCommittee ? 'posts' : 'upcoming');
  const list = tab === 'upcoming' ? q.data!.upcoming : q.data!.past;
  const newPost = () => router.push({ pathname: '/manage/post-form', params: { societyId: s.id } });

  return shell(
    <ScrollView
      style={{ backgroundColor: c.backgroundPlain }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
      <Artwork seed={s.id} uri={s.cover_url} category={s.category} style={styles.cover} />
      <View style={[styles.floating, { top: insets.top + 6 }]}>
        <FloatingButton
          icon="chevron-back"
          label={t('Back')}
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/societies'))}
        />
        <FloatingButton icon="ellipsis-horizontal" label={t('More options')} onPress={more} />
      </View>
      <View style={[styles.avatarRing, { backgroundColor: c.backgroundPlain }]}>
        <SocietyAvatar name={s.name} uri={s.logo_url} size={76} category={s.category} />
      </View>
      <View style={styles.headerBody}>
        <View style={{ gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.name, { color: c.text }]} accessibilityRole="header">
              {s.name}
            </Text>
            {s.verified && <VerifiedBadge size={20} color={c.tint} />}
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 14 }}>
            {t(s.category)}
            {s.college ? ` · ${t('{college} College', { college: t(s.college) })}` : ''}
          </Text>
        </View>
        {hidden && (
          <Pressable onPress={toggleHidden} accessibilityRole="button" style={{ marginHorizontal: -space.lg }}>
            <Banner icon="eye-off-outline" text={t('Hidden from your Discover and calendar. Tap to show again.')} />
          </Pressable>
        )}
        {s.status !== 'approved' && <Pill label={t('Pending review: only your committee can see this')} tone="warning" />}

        <View style={styles.stats}>
          <Stat value={compactNumber(s.follower_count)} label={t('followers')} />
          <Stat value={String(q.data!.upcoming.length)} label={t('upcoming')} />
          <Stat value={String(q.data!.past.length)} label={t('past events')} />
        </View>

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <FollowButton societyId={s.id} small={false} style={styles.headerAction} />
          </View>
          {isCommittee && (
            <Button
              title={t('Manage')}
              icon="options-outline"
              variant="secondary"
              style={styles.headerAction}
              onPress={() => router.push(`/manage/${s.id}`)}
            />
          )}
          <Pressable
            onPress={share}
            accessibilityRole="button"
            accessibilityLabel={t('Share')}
            style={({ pressed }) => [styles.iconButton, { backgroundColor: pressed ? c.fillStrong : c.fill }]}>
            <Icon name="share-outline" size={20} color={c.text} />
          </Pressable>
        </View>

        <Pressable onPress={() => setExpanded((e) => !e)} disabled={!s.description}>
          <Text style={{ color: c.textSecondary, fontSize: 15, lineHeight: 22, marginTop: 2 }} numberOfLines={expanded ? undefined : 3}>
            {s.description || t('No description yet.')}
          </Text>
        </Pressable>
        {(instagram || s.website || s.contact_email) && (
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {instagram && (
              <LinkChip icon="logo-instagram" label="Instagram" onPress={() => Linking.openURL(`https://instagram.com/${instagram}`)} />
            )}
            {s.website && <LinkChip icon="globe-outline" label={t('Website')} onPress={() => WebBrowser.openBrowserAsync(s.website!)} />}
            {s.contact_email && (
              <LinkChip icon="mail-outline" label={t('Email')} onPress={() => Linking.openURL(`mailto:${s.contact_email}`)} />
            )}
          </View>
        )}
      </View>

      {(plan || membership) && (
        <View style={[styles.join, { backgroundColor: c.background === c.backgroundPlain ? c.card : c.background }]}>
          <View style={[styles.joinIcon, { backgroundColor: c.tintSoft }]}>
            <Icon name="card-outline" size={22} color={c.tintText} />
          </View>
          {membership ? (
            <>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>
                  {membershipState(membership, membership.plan).key === 'active'
                    ? t("You're a member")
                    : membershipState(membership, membership.plan).label}
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                  {membership.plan.name} · {t('Valid until {date}', { date: formatLongDay(membership.plan.valid_until) })}
                </Text>
              </View>
              <Button
                small
                variant="ink"
                title={t('Card')}
                icon="qr-code-outline"
                onPress={() => router.push(`/membership/${membership.id}`)}
              />
            </>
          ) : (
            plan && (
              <>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>
                    {plan.price_hkd > 0 ? t('Join: {price} per year', { price: formatHkd(plan.price_hkd) }) : t('Join for free')}
                  </Text>
                  <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                    {plan.name} · {t('Member card in your Tickets')}
                  </Text>
                </View>
                <Button
                  small
                  variant="tinted"
                  title={t('Join')}
                  onPress={() =>
                    requireSignIn() && router.push({ pathname: '/membership/join', params: { planId: plan.id, societyId: s.id } })
                  }
                />
              </>
            )
          )}
        </View>
      )}

      {products.length > 0 && (
        <>
          <SectionHeader
            title={t('Shop')}
            action={t('See all')}
            onAction={() => router.push({ pathname: '/shop', params: { societyId: id } })}
          />
          <ProductRow products={products} />
        </>
      )}

      <View style={{ marginTop: space.lg }}>
        <UnderlineTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'posts', label: t('Posts') },
            { value: 'upcoming', label: `${t('Upcoming')} · ${q.data!.upcoming.length}` },
            { value: 'past', label: t('Past events') },
          ]}
        />
      </View>
      {tab === 'posts' ? (
        <View>
          {isCommittee && (
            <Pressable
              onPress={newPost}
              accessibilityRole="button"
              accessibilityLabel={t('Write a post')}
              style={({ pressed }) => [styles.composer, { borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 }]}>
              <SocietyAvatar name={s.name} uri={s.logo_url} size={40} category={s.category} />
              <View style={[styles.composerField, { backgroundColor: c.fill }]}>
                <Text style={{ color: c.textSecondary, fontSize: 15 }} numberOfLines={1}>
                  {t('Share an update with your followers…')}
                </Text>
              </View>
              <Icon name="image-outline" size={22} color={c.textSecondary} />
            </Pressable>
          )}
          {posts.length ? (
            posts.map((p) => (
              <PostCard
                key={`${p.id}:${p.like_count}:${liked.has(p.id)}`}
                post={p}
                liked={liked.has(p.id)}
                canManage={isCommittee}
                showSociety={false}
              />
            ))
          ) : (
            <View style={{ marginTop: 14 }}>
              <EmptyState
                icon="megaphone-outline"
                title={t('No posts yet')}
                body={
                  isCommittee
                    ? t('Share news, photos and event promos. Followers see them here.')
                    : t('Updates from {name} will show up here.', { name: s.short_name ?? s.name })
                }
                action={isCommittee ? <Button small title={t('Write a post')} icon="add" onPress={newPost} /> : undefined}
              />
            </View>
          )}
        </View>
      ) : (
        <View style={{ gap: 14, marginTop: 14 }}>
          {list.length ? (
            list.map((e) => <EventRow key={e.id} event={e} compact />)
          ) : (
            <EmptyState
              icon="calendar-outline"
              title={tab === 'upcoming' ? t('No upcoming events') : t('No past events yet')}
              body={tab === 'upcoming' ? t('Follow this society to see new events first.') : undefined}
            />
          )}
        </View>
      )}
    </ScrollView>,
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const c = useColors();
  return (
    <Text style={{ color: c.textSecondary, fontSize: 14 }}>
      <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text> {label}
    </Text>
  );
}

/** White round button floating over a cover: back, more. */
export function FloatingButton({
  icon,
  label,
  onPress,
}: {
  icon: 'chevron-back' | 'ellipsis-horizontal';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.floatingButton, { opacity: pressed ? 0.8 : 1 }]}>
      <Icon name={icon} size={20} color="#0A0A0B" />
    </Pressable>
  );
}

function LinkChip({
  icon,
  label,
  onPress,
}: {
  icon: 'logo-instagram' | 'globe-outline' | 'mail-outline';
  label: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={({ pressed }) => [styles.linkChip, { backgroundColor: c.fill, opacity: pressed ? 0.7 : 1 }]}>
      <Icon name={icon} size={14} color={c.text} />
      <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cover: { height: 176 },
  floating: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  floatingButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  avatarRing: { position: 'absolute', top: 132, left: space.lg, padding: 4, borderRadius: 26 },
  headerBody: { paddingHorizontal: space.lg, paddingTop: 52, gap: 12 },
  name: { fontSize: 25, lineHeight: 31, fontWeight: '600', letterSpacing: -0.4, flexShrink: 1 },
  stats: { flexDirection: 'row', gap: 18, flexWrap: 'wrap' },
  headerAction: { minHeight: 44 },
  iconButton: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: radius.pill,
  },
  join: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: 18,
    marginHorizontal: space.lg,
    marginTop: space.lg,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  composerField: { flex: 1, height: 40, borderRadius: radius.pill, justifyContent: 'center', paddingHorizontal: space.lg },
  joinIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
