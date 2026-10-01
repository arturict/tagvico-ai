import { ChangelogWorkspace } from '@/components/changelog-workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: "What's new" };

export default function ChangelogPage() {
  return <ChangelogWorkspace />;
}
