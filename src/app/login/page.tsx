import { getSessionUser } from '@/lib/server/auth';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { LoginForm } from '@/components/login-form';
import { getBackendConfigurationState } from '@/lib/server/system';

export const metadata = { title: 'Sign in' };

export default async function LoginPage() {
  if (await getBackendConfigurationState() === false) redirect('/setup');
  if (await getSessionUser()) redirect('/actions');
  return <main className="login-page"><section className="login-card">
    <div className="brand"><Image className="brand-mark" src="/tagvico-icon.png" alt="" width={31} height={31} /><span>Tagvico</span></div>
    <p className="eyebrow">Private by design</p><h1>Welcome home.</h1>
    <p className="lede">Turn documents into clear household actions—without giving an assistant unsupervised write access.</p>
    <LoginForm />
  </section></main>;
}
