import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { toast } from '@/components/Toast';
import {
  Banner,
  Button,
  EmptyState,
  ErrorView,
  ListGroup,
  ListRow,
  Loading,
  Pill,
  ProgressBar,
  SectionHeader,
  SegmentedControl,
  SocietyAvatar,
  StatTile,
} from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { isExpired, membershipState } from '@/lib/commerce';
import { confirmAsync, showAlert } from '@/lib/dialog';
import { formatHkd } from '@/lib/fps';
import { compactNumber, formatLongDay, formatWhen, todayHK } from '@/lib/format';
import { pickAndUploadImage } from '@/lib/pickImage';
import { radius, space, textStyle, useColors } from '@/lib/theme';
import type { EventWithSociety, Membership, MembershipPlan, PaymentSettings, ProductWithStock, ReviewStatus, SocietyOrder } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';
import { t, useLang } from '@/lib/i18n';

const REVIEW_TONE: Record<ReviewStatus, 'warning' | 'success' | 'danger'> = { pending: 'warning', approved: 'success', rejected: 'danger' };

type Section = 'events' | 'members' | 'shop';

export default function ManageSociety() {
  const { societyId, section: initial } = useLocalSearchParams<{ societyId: string; section?: Section }>();
  const c = useColors();
  const lang = useLang();
  const [section, setSection] = useState<Section>(initial ?? 'events');
  const [eventFilter, setEventFilter] = useState<'upcoming' | 'drafts' | 'past'>('upcoming');

  const q = useQuery(async () => {
    const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [society, events, banners, mine, plans, memberships, products, orders, payment] = await Promise.all([
      api.getSociety(societyId),
      api.listEvents({ societyIds: [societyId], from: monthAgo, includeDrafts: true }),
      api.societyBanners(societyId),
      api.mySocieties(),
      api.listPlans(societyId),
      api.listMemberships(societyId),
      api.listProducts(societyId),
      api.listOrders(societyId),
      api.getPaymentSettings(societyId),
    ]);
    const role = mine.find((m) => m.id === societyId)?.role ?? 'editor';
    return { society, events, banners, role, plans, memberships, products, orders, payment };
  }, [societyId]);

  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const s = q.data?.society;
  if (!s) return <ErrorView message={t("You don't have access to this society.")} />;
  const d = q.data!;
  const isAdmin = d.role !== 'editor';

  const changeLogo = async () => {
    if (!isAdmin) return;
    try {
      const url = await pickAndUploadImage([1, 1]);
      if (!url) return;
      await api.updateSociety(s.id, { logo_url: url });
      invalidate();
    } catch (e) {
      showAlert(t('Could not update logo'), errorMessage(e));
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
      <Stack.Screen options={{ title: s.short_name ?? s.name }} />

      <View style={styles.header}>
        <Pressable onPress={changeLogo} disabled={!isAdmin} accessibilityLabel={t('Change logo')}>
          <SocietyAvatar name={s.name} uri={s.logo_url} size={56} category={s.category} />
        </Pressable>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[textStyle('title2', lang), { color: c.text }]} numberOfLines={2}>
            {s.name}
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Pill label={t(d.role)} tone={d.role === 'owner' ? 'ink' : d.role === 'admin' ? 'brand' : 'neutral'} icon={null} />
            {s.status !== 'approved' && <Pill label={s.status === 'pending' ? t('Pending review') : t('Rejected')} tone={REVIEW_TONE[s.status]} />}
          </View>
        </View>
      </View>
      {s.status === 'pending' && (
        <View style={{ marginBottom: space.md }}>
          <Banner
            icon="hourglass-outline"
            tone="warning"
            text={t('The Student Affairs team is reviewing your society. You can prepare events now; students will see them once you’re approved.')}
          />
        </View>
      )}

      <SegmentedControl
        grey
        style={{ marginHorizontal: space.lg, marginBottom: space.lg }}
        value={section}
        onChange={setSection}
        options={[
          { value: 'events', label: t('Events') },
          { value: 'members', label: t('Members') },
          { value: 'shop', label: t('Shop') },
        ]}
      />

      {section === 'events' && (
        <EventsSection
          societyId={s.id}
          followers={s.follower_count}
          events={d.events}
          banners={d.banners}
          isAdmin={isAdmin}
          filter={eventFilter}
          setFilter={setEventFilter}
        />
      )}
      {section === 'members' && <MembersSection societyId={s.id} data={d} isAdmin={isAdmin} />}
      {section === 'shop' && <ShopSection societyId={s.id} data={d} isAdmin={isAdmin} />}
    </ScrollView>
  );
}

/** What the Members and Shop sections need from the dashboard query. */
type Data = {
  plans: MembershipPlan[];
  memberships: Membership[];
  products: ProductWithStock[];
  orders: SocietyOrder[];
  payment: PaymentSettings | null;
};

function EventsSection({
  societyId,
  followers,
  events,
  banners,
  isAdmin,
  filter,
  setFilter,
}: {
  societyId: string;
  followers: number;
  events: EventWithSociety[];
  banners: Awaited<ReturnType<typeof api.societyBanners>>;
  isAdmin: boolean;
  filter: 'upcoming' | 'drafts' | 'past';
  setFilter: (f: 'upcoming' | 'drafts' | 'past') => void;
}) {
  const c = useColors();
  const now = new Date().toISOString();
  const upcoming = events.filter((e) => e.ends_at >= now && e.status !== 'draft');
  const drafts = events.filter((e) => e.status === 'draft');
  const past = events.filter((e) => e.ends_at < now && e.status !== 'draft').reverse();
  const list = filter === 'upcoming' ? upcoming : filter === 'drafts' ? drafts : past;

  const removeBanner = async (id: string, title: string) => {
    if (!(await confirmAsync(t('Remove banner?'), t('“{title}” will stop showing on Discover.', { title }), t('Remove'), true))) return;
    try {
      await api.deleteBanner(id);
      invalidate();
      toast(t('Banner removed'));
    } catch (e) {
      showAlert(t('Could not remove'), errorMessage(e));
    }
  };

  return (
    <View>
      <View style={styles.stats}>
        <StatTile value={compactNumber(followers)} label={t('Followers')} />
        <StatTile value={String(upcoming.length)} label={t('Upcoming')} />
        <StatTile value={compactNumber(upcoming.reduce((n, e) => n + e.confirmed_count, 0))} label={t('Sign-ups')} />
      </View>
      <Button
        style={{ marginHorizontal: space.lg }}
        title={t('New event')}
        icon="add"
        onPress={() => router.push({ pathname: '/manage/event-form', params: { societyId } })}
      />
      <View style={{ marginTop: space.lg }}>
        <ListGroup>
          {isAdmin && (
            <ListRow
              icon="create-outline"
              title={t('Edit society details')}
              onPress={() => router.push({ pathname: '/manage/edit-society', params: { societyId } })}
            />
          )}
          <ListRow icon="people-outline" title={t('Committee')} onPress={() => router.push({ pathname: '/manage/members', params: { societyId } })} />
          <ListRow icon="eye-outline" title={t('View public page')} onPress={() => router.push(`/society/${societyId}`)} />
        </ListGroup>
      </View>

      <SectionHeader title={t('Events')} />
      <SegmentedControl
        grey
        style={{ marginHorizontal: space.lg, marginBottom: space.md }}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'upcoming', label: t('Upcoming') },
          { value: 'drafts', label: drafts.length ? t('Drafts ({n})', { n: drafts.length }) : t('Drafts') },
          { value: 'past', label: t('Past') },
        ]}
      />
      {list.length ? (
        <View style={{ gap: space.sm }}>
          {list.map((e) => (
            <ManageEventRow key={e.id} event={e} />
          ))}
        </View>
      ) : (
        <EmptyState
          icon="calendar-outline"
          title={filter === 'drafts' ? t('No drafts') : t('No events yet')}
          body={filter === 'upcoming' ? t('Create your first event. Students who follow you will see it on Discover.') : undefined}
        />
      )}

      <SectionHeader title={t('Promotional banners')} />
      {banners.length ? (
        <View style={{ gap: space.sm }}>
          {banners.map((b) => (
            <View key={b.id} style={[styles.row, { backgroundColor: c.card }]}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: c.text, fontWeight: '600' }}>{b.title}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('Until {when}', { when: formatWhen(b.ends_at) })}</Text>
              </View>
              <Pill label={t(b.status)} tone={REVIEW_TONE[b.status]} />
              <Button small variant="plain" title={t('Remove')} onPress={() => removeBanner(b.id, b.title)} />
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ color: c.textSecondary, marginHorizontal: space.lg }}>
          {t('Open one of your events and tap Promote to request a banner on the Discover page.')}
        </Text>
      )}
    </View>
  );
}

function ManageEventRow({ event: e }: { event: EventWithSociety }) {
  const c = useColors();
  const missing = e.status === 'draft' ? [!e.location && t('location'), !e.description && t('description')].filter(Boolean) : [];
  return (
    <Pressable
      onPress={() =>
        e.status === 'draft'
          ? router.push({ pathname: '/manage/event-form', params: { societyId: e.society_id, eventId: e.id } })
          : router.push({ pathname: '/manage/attendees', params: { eventId: e.id } })
      }
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.fill : c.card }]}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: c.text, fontWeight: '600', fontSize: 16 }} numberOfLines={2}>
          {e.title}
        </Text>
        <Text style={{ color: c.accentText, fontSize: 13, fontWeight: '600' }}>{formatWhen(e.starts_at)}</Text>
        {e.status === 'draft' ? (
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>
            {missing.length ? t('Still to add: {what}', { what: missing.join(', ') }) : t('Ready to publish')}
          </Text>
        ) : (
          e.registration_required &&
          e.capacity != null && <ProgressBar value={e.confirmed_count / e.capacity} tone={e.confirmed_count >= e.capacity ? 'warning' : 'success'} />
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {e.removed_at ? (
          <Pill label={t('Hidden by moderators')} tone="danger" />
        ) : e.status === 'draft' ? (
          <Pill label={t('Draft')} tone="neutral" icon="pencil" />
        ) : e.status === 'cancelled' ? (
          <Pill label={t('Cancelled')} tone="danger" />
        ) : (
          <Pill label={t('Published')} tone="info" icon="globe-outline" />
        )}
        {e.registration_required && e.status !== 'draft' && (
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>
            {e.capacity ? t('{n}/{capacity} going', { n: e.confirmed_count, capacity: e.capacity }) : t('{n} going', { n: e.confirmed_count })}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function MembersSection({ societyId, data, isAdmin }: { societyId: string; data: Data; isAdmin: boolean }) {
  const today = todayHK();
  const planById = new Map(data.plans.map((p) => [p.id, p]));
  const states = data.memberships.map((m) => membershipState(m, planById.get(m.plan_id) ?? { valid_until: today, price_hkd: 0 }).key);
  const active = states.filter((k) => k === 'active').length;
  const toCheck = states.filter((k) => k === 'claimed' || k === 'pending').length;
  const unpaid = states.filter((k) => k === 'unpaid').length;
  const current = data.plans.find((p) => p.valid_from <= today && today <= p.valid_until);

  return (
    <View>
      <View style={styles.stats}>
        <StatTile value={String(active)} label={t('Active members')} tone="success" />
        <StatTile value={String(toCheck)} label={t('To check')} tone={toCheck ? 'warning' : undefined} />
        <StatTile value={String(unpaid)} label={t('Not paid')} />
      </View>
      <Button
        style={{ marginHorizontal: space.lg }}
        title={t('Member list')}
        icon="people"
        onPress={() => router.push({ pathname: '/manage/roster', params: { societyId } })}
      />
      {!data.plans.length && (
        <View style={{ marginTop: space.lg }}>
          <Banner
            icon="information-circle-outline"
            text={t('Add this year’s membership plan so students can join from your society page and get a member card.')}
          />
        </View>
      )}
      <View style={{ marginTop: space.lg, gap: space.lg }}>
        <ListGroup title={t('Membership plans')}>
          {data.plans.map((p) => (
            <ListRow
              key={p.id}
              icon={p === current ? 'card' : 'card-outline'}
              title={p.name}
              subtitle={`${p.price_hkd > 0 ? formatHkd(p.price_hkd) : t('Free')} · ${t('Valid until {date}', { date: formatLongDay(p.valid_until) })}${p.is_open ? '' : ` · ${t('Closed')}`}`}
              onPress={isAdmin ? () => router.push({ pathname: '/manage/plan-form', params: { societyId, planId: p.id } }) : undefined}
            />
          ))}
          {isAdmin && (
            <ListRow icon="add-circle-outline" title={t('New membership plan')} onPress={() => router.push({ pathname: '/manage/plan-form', params: { societyId } })} />
          )}
        </ListGroup>
        <ListGroup title={t('Tools')}>
          {isAdmin && current && (
            <ListRow
              icon="cloud-upload-outline"
              title={t('Import from Excel or CSV')}
              subtitle={t('Bring last year’s member list across once')}
              onPress={() => router.push({ pathname: '/manage/import', params: { societyId, planId: current.id } })}
            />
          )}
          <ListRow
            icon="download-outline"
            title={t('Export member list')}
            subtitle={t('CSV for Excel and the OSA renewal')}
            onPress={() => router.push({ pathname: '/manage/roster', params: { societyId, export: '1' } })}
          />
          <ListRow
            icon="scan-outline"
            title={t('Scan member cards')}
            onPress={() => router.push({ pathname: '/manage/scan', params: { mode: 'member', societyId, title: t('Member cards') } })}
          />
        </ListGroup>
      </View>
    </View>
  );
}

function ShopSection({ societyId, data, isAdmin }: { societyId: string; data: Data; isAdmin: boolean }) {
  const c = useColors();
  const orders = data.orders.filter((o) => !isExpired(o));
  const toCheck = orders.filter((o) => o.status === 'payment_claimed').length;
  const toHandOut = orders.filter((o) => o.status === 'paid' || o.status === 'ready').length;
  const takings = orders.filter((o) => ['paid', 'ready', 'collected'].includes(o.status)).reduce((n, o) => n + o.total_hkd, 0);
  const noPayment = !data.payment?.fps_id && !data.payment?.payme_link;

  return (
    <View>
      <View style={styles.stats}>
        <StatTile value={String(toCheck)} label={t('Payments to check')} tone={toCheck ? 'warning' : undefined} />
        <StatTile value={String(toHandOut)} label={t('To hand out')} />
        <StatTile value={formatHkd(takings)} label={t('Paid')} tone="success" />
      </View>
      <Button
        style={{ marginHorizontal: space.lg }}
        title={t('Orders')}
        icon="receipt-outline"
        onPress={() => router.push({ pathname: '/manage/orders', params: { societyId } })}
      />
      {noPayment && (
        <View style={{ marginTop: space.lg }}>
          <Banner tone="warning" icon="alert-circle-outline" text={t('Add your FPS or PayMe details so buyers can pay you.')} />
        </View>
      )}
      <View style={{ marginTop: space.lg, gap: space.lg }}>
        <ListGroup title={t('Products')}>
          {data.products.map((p) => (
            <ListRow
              key={p.id}
              icon="pricetag-outline"
              title={p.title}
              subtitle={`${formatHkd(p.price_hkd)} · ${p.status === 'draft' ? t('Draft') : p.status === 'closed' ? t('Closed') : t('On sale')}`}
              onPress={() => router.push({ pathname: '/manage/product-form', params: { societyId, productId: p.id } })}
            />
          ))}
          <ListRow icon="add-circle-outline" title={t('Add a product')} onPress={() => router.push({ pathname: '/manage/product-form', params: { societyId } })} />
        </ListGroup>
        <ListGroup title={t('Payments and pickup')}>
          {isAdmin && (
            <ListRow
              icon="wallet-outline"
              title={t('Payment details')}
              value={noPayment ? t('Not set') : (data.payment?.payee_name ?? undefined)}
              onPress={() => router.push({ pathname: '/manage/payment-settings', params: { societyId } })}
            />
          )}
          <ListRow
            icon="scan-outline"
            title={t('Pickup scanner')}
            onPress={() => router.push({ pathname: '/manage/scan', params: { mode: 'pickup', societyId, title: t('Pickup') } })}
          />
        </ListGroup>
        <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19, marginHorizontal: space.lg }}>
          {t('Buyers pay your society directly by FPS, PayMe or cash. The app never holds money; refunds happen outside the app.')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, margin: space.lg },
  stats: { flexDirection: 'row', gap: space.sm, marginHorizontal: space.lg, marginBottom: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    padding: space.md,
    borderRadius: radius.md,
  },
});
