import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { compactNumber } from '@/lib/format';
import { space, useColors } from '@/lib/theme';
import type { Society } from '@/lib/types';
import { showAlert } from '@/lib/dialog';
import { t } from '@/lib/i18n';

import { Button, Icon, SocietyAvatar } from './ui';

export function FollowButton({ societyId, small = true }: { societyId: string; small?: boolean }) {
  const { followIds, toggleFollow } = useAuth();
  const following = followIds.has(societyId);
  // In lists a tinted pill, so a list of societies isn't a wall of filled buttons;
  // full size (society page) it is that screen's primary action.
  const variant = small ? (following ? 'outline' : 'tinted') : following ? 'secondary' : 'primary';
  return (
    <Button
      small={small}
      title={following ? t('Following') : t('Follow')}
      icon={following ? 'checkmark' : 'add'}
      variant={variant}
      onPress={() => toggleFollow(societyId).catch((e) => showAlert(t('Could not update'), errorMessage(e)))}
    />
  );
}

export function SocietyRow({ society }: { society: Society }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => router.push(`/society/${society.id}`)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.fill : c.backgroundPlain }]}>
      <SocietyAvatar name={society.name} uri={society.logo_url} category={society.category} size={48} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ color: c.text, fontSize: 16, lineHeight: 21, fontWeight: '600', flexShrink: 1 }} numberOfLines={2}>
            {society.name}
          </Text>
          {society.verified && <Icon name="checkmark-circle" size={14} color={c.tintText} />}
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={1}>
          {t(society.category)}
          {society.college ? ` · ${t(society.college)}` : ''} · {t('{n} followers', { n: compactNumber(society.follower_count) })}
        </Text>
      </View>
      <FollowButton societyId={society.id} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
});
