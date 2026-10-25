import { TabStack } from '@/components/TabStack';
import { t } from '@/lib/i18n';

export default function Layout() {
  return <TabStack title={t('My Tickets')} />;
}
