import { AutomationDashboard } from '@/components/automation-dashboard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Overview' };

export default function AutomationPage() {
  return <AutomationDashboard />;
}
