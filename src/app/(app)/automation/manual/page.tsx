import { ManualProcessingWorkspace } from '@/components/manual-processing-workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Manual processing' };

export default function ManualProcessingPage() {
  return <ManualProcessingWorkspace />;
}
