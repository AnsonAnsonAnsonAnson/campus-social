import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { compactNumber, formatDay } from '@/lib/format';
import { space, useColors } from '@/lib/theme';
import type { Society } from '@/lib/types';
import { showAlert } from '@/lib/dialog';
import { t } from '@/lib/i18n';

import { VerifiedBadge } from './Glyph';
import { Button, SocietyAvatar } from './ui';

export function FollowButton({ societyId, small = true, style }: { societyId: string; small?: boolean; style?: StyleProp<ViewStyle> }) {
  const { followIds, toggleFollow } = useAuth();
  const following = followIds.has(societyId);
  // In lists a tinted pill, so a list of societies isn't a wall of filled buttons;
  // full size (society page) it is that screen's primary action.
  const variant = small ? (following ? 'outline' : 'tinted') : following ? 'secondary' : 'primary';
  return (
    <Button
      small={small}
      title={following ? t('Following') : t('Follow')}
      icon={following ? 'checkmark' : undefined}
      variant={variant}
      style={style}
      onPress={() => toggleFollow(societyId).catch((e) => showAlert(t('Could not update'), errorMessage(e)))}
    />
  );
}

/** Society list row. `next` adds the "Next: date · title" line from the design. */
export function SocietyRow({ society, next }: { society: Society; next?: { starts_at: string; title: string } | null }) {
  const c = useColors();
  // Follow is a sibling of the row link, not inside it: nested buttons are invalid
  // on web and VoiceOver can't reach the inner one.
  return (
    <View style={[styles.row, { backgroundColor: c.backgroundPlain }]}>
      <Pressable
        onPress={() => router.push(`/society/${society.id}`)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}>
        <SocietyAvatar name={society.name} uri={society.logo_url} category={society.category} size={48} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: c.text, fontSize: 16, lineHeight: 21, fontWeight: '600', flexShrink: 1 }} numberOfLines={2}>
              {society.name}
            </Text>
            {society.verified && <VerifiedBadge size={15} color={c.tint} />}
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={1}>
            {t(society.category)}
            {society.college ? ` · ${t(society.college)}` : ''} · {t('{n} followers', { n: compactNumber(society.follower_count) })}
          </Text>
          {next !== undefined && (
            <Text style={{ color: next ? c.accentText : c.textTertiary, fontSize: 13, marginTop: 1 }} numberOfLines={1}>
              {next ? t('Next: {when} · {title}', { when: formatDay(next.starts_at), title: next.title }) : t('No upcoming events')}
            </Text>
          )}
        </View>
      </Pressable>
      <FollowButton societyId={society.id} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  link: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  card: { width: 150, padding: space.md, borderRadius: 18, gap: space.md },
});

/** Recommendation card for the horizontal "Picked for you" row on Societies. */
export function SocietyCard({ society }: { society: Society }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.fill }]}>
      <Pressable onPress={() => router.push(`/society/${society.id}`)} accessibilityRole="button" style={{ gap: 6, flex: 1 }}>
        <SocietyAvatar name={society.name} uri={society.logo_url} category={society.category} size={48} />
        <Text style={{ color: c.text, fontSize: 15, lineHeight: 20, fontWeight: '600', marginTop: 4 }} numberOfLines={2}>
          {society.name}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
          {t(society.category)} · {compactNumber(society.follower_count)}
        </Text>
      </Pressable>
      <FollowButton societyId={society.id} />
    </View>
  );
}
