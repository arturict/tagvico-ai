'use client';

import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[Tagvico page error]', error);
  }, [error]);

  return <main className="route-state-page">
    <section className="route-state-card" role="alert">
      <p className="eyebrow">Temporary problem</p>
      <h1>This page could not load.</h1>
      <p>Your documents and background processing were not changed. Retry this page or return to Actions.</p>
      <div className="workspace-actions">
        <button className="button primary" type="button" onClick={reset}>Try again</button>
        <a className="button" href="/actions">Go to Actions</a>
      </div>
    </section>
  </main>;
}
