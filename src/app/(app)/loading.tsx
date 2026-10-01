import { WorkspacePageSkeleton } from '@/components/workspace-page-skeleton';

/** Shown while any page of the app without its own loading file is being prepared. */
export default function AppLoading() {
  return <WorkspacePageSkeleton />;
}
