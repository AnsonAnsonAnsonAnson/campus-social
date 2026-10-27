import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActionSheetIOS, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { EventRow } from '@/components/EventCard';
import { ProductRow } from '@/components/ProductCard';
import { FollowButton } from '@/components/SocietyRow';
import { Artwork, Button, EmptyState, ErrorView, Icon, Loading, Pill, SectionHeader, SocietyAvatar, UnderlineTabs } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { membershipState } from '@/lib/commerce';
import { showAlert } from '@/lib/dialog';
import { formatHkd } from '@/lib/fps';
import { compactNumber, formatLongDay, todayHK } from '@/lib/format';
import { radius, space, textStyle, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';
import { t, useLang } from '@/lib/i18n';

export default function SocietyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const lang = useLang();
  const { user, requireSignIn } = useAuth();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [expanded, setExpanded] = useState(false);

  const q = useQuery(async () => {
    const now = new Date().toISOString();
    const [society, upcoming, past, mine, plans, products, memberships] = await Promise.all([
      api.getSociety(id),
      api.listEvents({ societyIds: [id], from: now }),
      api.listEvents({ societyIds: [id], to: now }),
      api.mySocieties(),
      api.listPlans(id),
      api.listProducts(id),
      api.myMemberships(),
    ]);
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
    };
  }, [id, user?.id]);

  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const s = q.data?.society;
  if (!s) return <ErrorView message={t('This society could not be found.')} />;
  const { plan, membership, products } = q.data!;

  const instagram = s.instagram?.replace(/^@/, '');
  const share = () => Share.share({ message: `${s.name}\n${Linking.createURL(`/society/${s.id}`)}` });
  const report = () => requireSignIn() && router.push({ pathname: '/report', params: { type: 'society', id: s.id, name: s.name } });
  const more = () => {
    const options = [t('Share'), t('Report society'), t('Cancel')];
    const run = (i: number) => (i === 0 ? share() : i === 1 ? report() : undefined);
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2, destructiveButtonIndex: 1 }, run);
    else
      showAlert(s.name, undefined, [
        { text: options[0], onPress: () => run(0) },
        { text: options[1], onPress: () => run(1) },
        { text: t('Cancel'), style: 'cancel' },
      ]);
  };

  const list = tab === 'upcoming' ? q.data!.upcoming : q.data!.past;

  return (
    <ScrollView
      style={{ backgroundColor: c.backgroundPlain }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
      <Stack.Screen
        options={{
          title: s.short_name ?? s.name,
          headerRight: () => (
            <Pressable hitSlop={12} accessibilityLabel={t('More options')} onPress={more} style={styles.headerButton}>
              <Icon name="ellipsis-horizontal" size={20} color={c.text} />
            </Pressable>
          ),
        }}
      />
      <Artwork seed={s.id} uri={s.cover_url} category={s.category} style={styles.cover} />
      <View style={styles.headerBody}>
        <View style={[styles.avatarRing, { backgroundColor: c.backgroundPlain }]}>
          <SocietyAvatar name={s.name} uri={s.logo_url} size={84} category={s.category} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[textStyle('title1', lang), { color: c.text, flexShrink: 1 }]}>{s.name}</Text>
          {s.verified && <Icon name="checkmark-circle" size={20} color={c.tintText} />}
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 15 }}>
          {t(s.category)}
          {s.college ? ` · ${t('{college} College', { college: t(s.college) })}` : ''}
        </Text>
        {s.status !== 'approved' && <Pill label={t('Pending review: only your committee can see this')} tone="warning" />}

        <View style={styles.stats}>
          <Stat value={compactNumber(s.follower_count)} label={t('Followers')} />
          <Stat value={String(q.data!.upcoming.length)} label={t('Upcoming')} />
          <Stat value={String(q.data!.past.length)} label={t('Past events')} />
        </View>

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <FollowButton societyId={s.id} small={false} />
          </View>
          {q.data?.isCommittee && (
            <Button title={t('Manage')} icon="options-outline" variant="secondary" onPress={() => router.push(`/manage/${s.id}`)} />
          )}
          <Pressable onPress={share} accessibilityRole="button" accessibilityLabel={t('Share')} style={[styles.iconButton, { backgroundColor: c.fill }]}>
            <Icon name="share-outline" size={20} color={c.text} />
          </Pressable>
        </View>
      </View>

      <View style={{ paddingHorizontal: space.lg, gap: space.md, marginTop: space.lg }}>
        <Pressable onPress={() => setExpanded((e) => !e)} disabled={!s.description}>
          <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }} numberOfLines={expanded ? undefined : 3}>
            {s.description || t('No description yet.')}
          </Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          {instagram && <LinkChip icon="logo-instagram" label={`@${instagram}`} onPress={() => Linking.openURL(`https://instagram.com/${instagram}`)} />}
          {s.website && <LinkChip icon="globe-outline" label={t('Website')} onPress={() => WebBrowser.openBrowserAsync(s.website!)} />}
          {s.contact_email && <LinkChip icon="mail-outline" label={t('Email')} onPress={() => Linking.openURL(`mailto:${s.contact_email}`)} />}
        </View>
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
                  {membershipState(membership, membership.plan).key === 'active' ? t("You're a member") : membershipState(membership, membership.plan).label}
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                  {membership.plan.name} · {t('Valid until {date}', { date: formatLongDay(membership.plan.valid_until) })}
                </Text>
              </View>
              <Button small variant="ink" title={t('Card')} icon="qr-code-outline" onPress={() => router.push(`/membership/${membership.id}`)} />
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
                  onPress={() => requireSignIn() && router.push({ pathname: '/membership/join', params: { planId: plan.id, societyId: s.id } })}
                />
              </>
            )
          )}
        </View>
      )}

      {products.length > 0 && (
        <>
          <SectionHeader title={t('Shop')} />
          <ProductRow products={products} />
        </>
      )}

      <View style={{ marginTop: space.xl }}>
        <UnderlineTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'upcoming', label: t('Upcoming'), count: q.data!.upcoming.length },
            { value: 'past', label: t('Past') },
          ]}
        />
      </View>
      <View style={{ gap: space.sm, marginTop: space.md }}>
        {list.length ? (
          list.map((e) => <EventRow key={e.id} event={e} />)
        ) : (
          <EmptyState
            icon="calendar-outline"
            title={tab === 'upcoming' ? t('No upcoming events') : t('No past events yet')}
            body={tab === 'upcoming' ? t('Follow this society to see new events first.') : undefined}
          />
        )}
      </View>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

function LinkChip({ icon, label, onPress }: { icon: 'logo-instagram' | 'globe-outline' | 'mail-outline'; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={({ pressed }) => [styles.linkChip, { backgroundColor: c.fill, opacity: pressed ? 0.7 : 1 }]}>
      <Icon name={icon} size={15} color={c.text} />
      <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cover: { height: 150 },
  headerBody: { paddingHorizontal: space.lg, gap: 4, marginTop: -46 },
  avatarRing: { padding: 4, borderRadius: 28, alignSelf: 'flex-start', marginBottom: space.sm },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', marginVertical: space.md },
  iconButton: { width: 50, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  linkChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.pill },
  join: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: 18, marginHorizontal: space.lg, marginTop: space.lg },
  joinIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
