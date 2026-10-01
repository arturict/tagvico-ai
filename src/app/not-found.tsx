import { Mascot } from '@/components/mascot/mascot';

export default function NotFound() {
  return <main className="state-page">
    <section className="state-card">
      <Mascot pose="searching" size={96} />
      <h1 className="state-title">This page is not part of Tagvico.</h1>
      <p>The address may be mistyped or the page may have moved. Start again from the chat, or open the documentation for the version running on this instance.</p>
      <div className="pg-empty-actions">
        <a className="btn btn-primary btn-40" href="/companion">Open chat</a>
        <a className="btn btn-secondary btn-40" href="/inbox">Needs you</a>
        <a className="btn btn-ghost btn-40" href="/docs/">Documentation</a>
      </div>
    </section>
  </main>;
}
