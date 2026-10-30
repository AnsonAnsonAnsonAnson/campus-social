import { useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView } from 'react-native';

import { PostCard } from '@/components/PostCard';
import { ErrorView, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { useQuery } from '@/lib/useQuery';

/** One post on its own: shared links and the review queue open here. */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { user } = useAuth();
  const q = useQuery(async () => {
    const [post, liked, mine] = await Promise.all([api.getPost(id), api.myLikedPostIds([id]), api.mySocieties()]);
    return { post, liked: liked.includes(id), canManage: !!post && mine.some((s) => s.id === post.society_id) };
  }, [id, user?.id]);

  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView message={q.error} onRetry={q.refresh} />;
  const { post, liked, canManage } = q.data!;
  if (!post) return <ErrorView message={t('This post is no longer available.')} />;
  return (
    <ScrollView
      style={{ backgroundColor: c.backgroundPlain }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} />}>
      <PostCard key={`${post.id}:${post.like_count}:${liked}`} post={post} liked={liked} canManage={canManage} />
    </ScrollView>
  );
}
