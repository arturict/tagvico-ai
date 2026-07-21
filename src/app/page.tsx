import { redirect } from 'next/navigation';
import { getBackendConfigurationState } from '@/lib/server/system';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (await getBackendConfigurationState() === false) redirect('/setup');
  redirect('/actions');
}
