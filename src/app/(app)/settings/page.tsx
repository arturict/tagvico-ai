import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';

export const metadata = { title: 'Settings' };

export default async function SettingsIndexPage() {
  const user = await requireUser();
  redirect(workspaceFor(user).role === 'owner' ? '/settings/paperless' : '/settings/general');
}
