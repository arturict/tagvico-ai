import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import { TagUnification } from '@/components/settings/tag-unification';
import type { SettingsResponse } from '@/components/settings/types';

const settingsV3Module = require('@root/services/settingsV3Service');
const settingsV3Service = settingsV3Module.default || settingsV3Module;

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Organize tags' };

export default async function TagsPage() {
  // The tag vocabulary is shared by the whole installation, so only the owner organizes it.
  const user = await requireUser();
  if (workspaceFor(user).role !== 'owner') redirect('/settings/people');
  const settings = await settingsV3Service.getSettings() as SettingsResponse;

  return <div className="page-column tagorg-page">
    <header className="page-header">
      <div className="page-header-text">
        <h1 className="page-title">Organize tags</h1>
        <p className="page-description">Find overlapping tags and merge them one approval at a time.</p>
      </div>
    </header>
    <TagUnification
      activeProviderId={settings.ai.activeProviderInstanceId}
      activeModelId={settings.ai.activeModelId}
    />
  </div>;
}
