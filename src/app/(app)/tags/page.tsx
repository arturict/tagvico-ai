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

  return <div className="page tag-organizer-page">
    <header className="page-head tag-organizer-head">
      <div>
        <p className="eyebrow">Paperless vocabulary</p>
        <h1>Organize tags</h1>
        <p className="lede">
          Find overlapping tags, review exactly what will move, then apply every merge in two deliberate steps.
        </p>
      </div>
      <div className="tag-organizer-safety">
        <strong>Nothing changes during analysis</strong>
        <span>Approve each mapping before Tagvico touches Paperless.</span>
      </div>
    </header>

    <section className="workspace-card tag-organizer-flow" aria-label="Tag merge workflow">
      <div><span>1</span><strong>Analyze</strong><small>Read the existing tag library</small></div>
      <div><span>2</span><strong>Review</strong><small>See source tags, target and impact</small></div>
      <div><span>3</span><strong>Move</strong><small>Apply the target tag to documents</small></div>
      <div><span>4</span><strong>Delete</strong><small>Remove the now-unused source tag</small></div>
    </section>

    <section className="workspace-card tag-organizer-workspace">
      <TagUnification
        providers={settings.ai.providers}
        activeProviderId={settings.ai.activeProviderInstanceId}
        activeModelId={settings.ai.activeModelId}
      />
    </section>
  </div>;
}
