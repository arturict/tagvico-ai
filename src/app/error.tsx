'use client';

import { useEffect } from 'react';
import { Mascot } from '@/components/mascot/mascot';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[Tagvico page error]', error);
  }, [error]);

  return <main className="state-page">
    <section className="state-card" role="alert">
      <Mascot pose="oops" size={96} />
      <h1 className="state-title">This page could not load.</h1>
      <p>Your documents and background processing were not changed. Try again; if it keeps happening, restart Tagvico and check its logs.</p>
      <div className="pg-empty-actions">
        <button className="btn btn-primary btn-40" type="button" onClick={reset}>Try again</button>
        <a className="btn btn-secondary btn-40" href="/companion">Go to chat</a>
      </div>
    </section>
  </main>;
}
