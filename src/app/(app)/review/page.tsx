import { ReviewQueueWorkspace } from '@/components/review-queue-workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Review queue' };

export default function ReviewQueuePage() {
  return <ReviewQueueWorkspace />;
}
