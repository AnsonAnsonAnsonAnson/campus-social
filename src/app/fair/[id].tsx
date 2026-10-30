import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ProductCard } from '@/components/ProductCard';
import { toast } from '@/components/Toast';
import {
  Artwork,
  Banner,
  Button,
  Chip,
  ChipRow,
  EmptyState,
  ErrorView,
  Field,
  Icon,
  InfoRow,
  ListGroup,
  ListRow,
  Loading,
  Pill,
  SectionHeader,
  Sheet,
  SocietyAvatar,
} from '@/components/ui';
import { api, errorMessage, invalidate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bagCount, bagKey, useAllBags } from '@/lib/bag';
import { fairState } from '@/lib/commerce';
import { showAlert } from '@/lib/dialog';
import { formatWhen } from '@/lib/format';
import { t, useLang } from '@/lib/i18n';
import { radius, space, textStyle, useColors } from '@/lib/theme';
import type { ProductWithStock } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

type Filter = 'all' | 'merch' | 'voucher';

/**
 * A fair: every booth's presale in one place. Buyers pre-pay merch to collect at
 * the booth and food vouchers to use there; society admins ask for a booth here.
 */
export default function FairScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const lang = useLang();
  const { width } = useWindowDimensions();
  const { user, requireSignIn } = useAuth();
  const bags = useAllBags();
  const [filter, setFilter] = useState<Filter>('all');
  const [asking, setAsking] = useState(false);
  const [askFor, setAskFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const q = useQuery(async () => {
    const [fair, products, mine] = await Promise.all([
      api.getFair(id),
      api.listFairProducts(id),
      user ? api.mySocieties().catch(() => []) : Promise.resolve([]),
    ]);
    return { fair, products, mine };
  }, [id, user?.id]);

  const booths = useMemo(() => {
    const byBooth = new Map<string, { society: ProductWithStock['society']; booth: string | null; items: ProductWithStock[] }>();
    for (const p of q.data?.products ?? []) {
      if (filter !== 'all' && (p.kind ?? 'merch') !== filter) continue;
      const g = byBooth.get(p.society_id) ?? { society: p.society, booth: p.booth ?? null, items: [] };
      g.items.push(p);
      byBooth.set(p.society_id, g);
    }
    return [...byBooth.values()];
  }, [q.data, filter]);

  if (q.loading && !q.data) return <Loading />;
  if (q.error && !q.data) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const f = q.data?.fair;
  if (!f) return <ErrorView message={t('This fair is not listed')} />;

  const state = fairState(f);
  const vouchers = (q.data?.products ?? []).filter((p) => p.kind === 'voucher').length;
  const tile = (width - space.lg * 2 - space.md) / 2;
  const adminOf = (q.data?.mine ?? []).filter((s) => s.role !== 'editor' && s.status === 'approved');
  const myBooths = f.booths.filter(
    (b) => adminOf.some((s) => s.id === b.society_id) || (q.data?.mine ?? []).some((s) => s.id === b.society_id),
  );
  const canAsk =
    f.booths_open && state.key !== 'over' && adminOf.some((s) => !f.booths.some((b) => b.society_id === s.id && b.status !== 'rejected'));
  const confirmed = f.booths.filter((b) => b.status === 'approved');
  const myBags = confirmed.map((b) => ({ booth: b, n: bagCount(bags[bagKey(b.society_id, f.id)] ?? []) })).filter((x) => x.n > 0);

  const ask = async () => {
    if (!askFor) return;
    setBusy(true);
    try {
      await api.applyForBooth(f.id, askFor, note);
      invalidate();
      setAsking(false);
      setNote('');
      toast(t('Booth requested. {name} will confirm it.', { name: f.organiser.short_name ?? f.organiser.name }));
    } catch (e) {
      showAlert(t('Could not ask for a booth'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const openAsk = () => {
    if (!requireSignIn()) return;
    const free = adminOf.filter((s) => !f.booths.some((b) => b.society_id === s.id && b.status !== 'rejected'));
    setAskFor(free[0]?.id ?? null);
    setAsking(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.backgroundPlain }}>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
        <Artwork seed={f.id} uri={f.cover_url} category="Social" style={styles.cover}>
          <View style={styles.coverShade} />
          <View style={styles.coverText}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Pill label={state.label} tone={state.tone} icon={state.key === 'on' ? 'radio-button-on' : 'storefront-outline'} />
              {f.status !== 'approved' && <Pill label={f.status === 'pending' ? t('Pending review') : t('Rejected')} tone="warning" />}
            </View>
            <Text style={[textStyle('title1', lang), { color: '#fff' }]} numberOfLines={2}>
              {f.name}
            </Text>
          </View>
        </Artwork>

        <View style={{ padding: space.lg, gap: space.md }}>
          <Pressable
            onPress={() => router.push(`/society/${f.organiser.id}`)}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <SocietyAvatar name={f.organiser.name} uri={f.organiser.logo_url} category={f.organiser.category} size={24} />
            <Text style={{ color: c.textSecondary, fontSize: 15, flex: 1 }} numberOfLines={1}>
              {t('Organised by {name}', { name: f.organiser.name })}
            </Text>
          </Pressable>
          <View>
            <InfoRow icon="calendar-outline" title={formatWhen(f.starts_at, f.ends_at)} />
            <InfoRow icon="location-outline" title={f.venue} />
            <InfoRow
              icon="storefront-outline"
              title={t('{n} booths', { n: f.booth_count })}
              sub={vouchers ? t('{n} items on presale, {v} of them food vouchers', { n: f.product_count, v: vouchers }) : undefined}
            />
          </View>
          {!!f.description && <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>{f.description}</Text>}

          <Banner
            icon={state.presaleOpen ? 'flash-outline' : 'time-outline'}
            tone={state.presaleOpen ? 'success' : 'info'}
            text={
              state.presaleOpen
                ? f.presale_closes_at
                  ? t('Pre-pay and skip the queue. Presale closes {when}.', { when: formatWhen(f.presale_closes_at) })
                  : t('Pre-pay and skip the queue: collect at the booth, or show your voucher QR for food.')
                : t('Presale has closed. Buy at the booths on the day.')
            }
          />

          {f.can_manage && (
            <Button
              variant="secondary"
              icon="settings-outline"
              title={t('Manage fair')}
              onPress={() => router.push({ pathname: '/manage/fair', params: { fairId: f.id } })}
            />
          )}
          {myBooths
            .filter((b) => b.status !== 'approved')
            .map((b) => (
              <Banner
                key={b.id}
                icon={b.status === 'pending' ? 'hourglass-outline' : 'close-circle-outline'}
                tone={b.status === 'pending' ? 'warning' : 'danger'}
                text={
                  b.status === 'pending'
                    ? t('{society}: booth requested, waiting for {organiser}.', { society: b.society.name, organiser: f.organiser.name })
                    : t('{society}: no booth this time.', { society: b.society.name })
                }
              />
            ))}
          {canAsk && <Button variant="secondary" icon="add-circle-outline" title={t('Ask for a booth')} onPress={openAsk} />}
        </View>

        {myBags.length > 0 && (
          <ListGroup title={t('Your bags at this fair')}>
            {myBags.map(({ booth, n }) => (
              <ListRow
                key={booth.id}
                icon="bag-handle-outline"
                title={booth.society.name}
                subtitle={t('{n} items', { n })}
                value={t('Check out')}
                onPress={() => router.push({ pathname: '/shop/bag', params: { societyId: booth.society_id, fairId: f.id } })}
              />
            ))}
          </ListGroup>
        )}

        <View style={{ marginTop: space.md }}>
          <ChipRow>
            <Chip label={t('All')} selected={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label={t('Merch')} icon="shirt-outline" selected={filter === 'merch'} onPress={() => setFilter('merch')} />
            <Chip
              label={t('Food vouchers')}
              icon="fast-food-outline"
              selected={filter === 'voucher'}
              onPress={() => setFilter('voucher')}
            />
          </ChipRow>
        </View>

        {booths.length ? (
          booths.map((g) => (
            <View key={g.society.id} style={{ marginTop: space.lg }}>
              <Pressable onPress={() => router.push(`/society/${g.society.id}`)} accessibilityRole="button" style={styles.boothHead}>
                {g.booth && (
                  <View style={[styles.boothTag, { backgroundColor: c.text }]}>
                    <Text style={{ color: c.background, fontSize: 13, fontWeight: '700' }}>{g.booth}</Text>
                  </View>
                )}
                <SocietyAvatar name={g.society.name} uri={g.society.logo_url} category={g.society.category} size={28} />
                <Text style={{ color: c.text, fontSize: 17, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                  {g.society.name}
                </Text>
                <Icon name="chevron-forward" size={16} color={c.textTertiary} />
              </Pressable>
              <View style={styles.grid}>
                {g.items.map((p) => (
                  <ProductCard key={p.id} product={p} width={tile} />
                ))}
              </View>
            </View>
          ))
        ) : (
          <EmptyState
            icon="storefront-outline"
            title={t('Nothing on presale yet')}
            body={t('Booths add their merch and food vouchers in the weeks before the fair.')}
          />
        )}

        {confirmed.length > 0 && (
          <>
            <SectionHeader title={t('Booths')} />
            <ListGroup>
              {confirmed.map((b) => (
                <ListRow
                  key={b.id}
                  icon="storefront-outline"
                  title={b.society.name}
                  value={b.label ?? undefined}
                  onPress={() => router.push(`/society/${b.society_id}`)}
                />
              ))}
            </ListGroup>
          </>
        )}
      </ScrollView>

      <Sheet visible={asking} onClose={() => setAsking(false)}>
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>{t('Ask for a booth')}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 15, lineHeight: 21 }}>
            {t('{name} confirms booths and gives each a number. Once confirmed, you can add presale items and food vouchers.', {
              name: f.organiser.name,
            })}
          </Text>
          {adminOf.length > 1 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {adminOf
                .filter((s) => !f.booths.some((b) => b.society_id === s.id && b.status !== 'rejected'))
                .map((s) => (
                  <Chip key={s.id} label={s.short_name ?? s.name} selected={askFor === s.id} onPress={() => setAskFor(s.id)} />
                ))}
            </View>
          )}
          <Field
            label={t('What will you sell?')}
            value={note}
            onChangeText={setNote}
            maxLength={300}
            placeholder={t('e.g. Bubble tea, about 200 cups, and our hoodies')}
          />
          <Button title={t('Send request')} icon="paper-plane-outline" loading={busy} disabled={!askFor} onPress={ask} />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { height: 220, justifyContent: 'flex-end' },
  coverShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  coverText: { padding: space.lg, gap: space.sm },
  boothHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, marginBottom: space.md },
  boothTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingHorizontal: space.lg, rowGap: space.lg },
});
