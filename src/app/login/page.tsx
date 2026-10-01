import { getSessionUser } from '@/lib/server/auth';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { LoginForm } from '@/components/login-form';
import { getBackendConfigurationState } from '@/lib/server/system';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  const firstRun = String((await searchParams).setup || '') === 'success';
  if (await getBackendConfigurationState() === false) redirect('/setup');
  if (await getSessionUser()) redirect(firstRun ? '/companion?welcome=1' : '/actions');
  return <main className="auth-page"><section className="auth-column" aria-labelledby="login-title">
    <div className="auth-logo"><Image src="/tagvico-icon.png" alt="" width={28} height={28} /><span>Tagvico</span></div>
    <h1 className="auth-title" id="login-title">Sign in</h1>
    <LoginForm firstRun={firstRun} />
  </section></main>;
}
