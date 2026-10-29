import { Stack } from 'expo-router';
import { RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';

import { FairCard } from '@/components/FairCard';
import { EmptyState, ErrorView, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { space, useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';

/** Every fair coming up or on now. Society admins find a fair here to ask for a booth. */
export default function Fairs() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const q = useQuery(() => api.listFairs(), [user?.id]);

  if (q.loading && !q.data) return <Loading />;
  if (q.error && !q.data) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const fairs = q.data ?? [];

  return (
    <ScrollView
      style={{ backgroundColor: c.backgroundPlain }}
      contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
      <Stack.Screen options={{ title: t('Fairs') }} />
      {fairs.length ? (
        fairs.map((f) => <FairCard key={f.id} fair={f} width={width - space.lg * 2} />)
      ) : (
        <View style={{ marginTop: 80 }}>
          <EmptyState
            icon="storefront-outline"
            title={t('No fairs coming up')}
            body={t('Fairs like the Christmas fair and O’Camp show here once the organisers list them.')}
          />
        </View>
      )}
    </ScrollView>
  );
}
