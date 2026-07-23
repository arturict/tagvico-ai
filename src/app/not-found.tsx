export default function NotFound() {
  return <main className="route-state-page">
    <section className="route-state-card">
      <p className="eyebrow">404</p>
      <h1>This page is not part of Tagvico.</h1>
      <p>Use the product navigation or open the documentation for the version running on this instance.</p>
      <div className="workspace-actions">
        <a className="button primary" href="/actions">Open Actions</a>
        <a className="button" href="/docs/">Documentation</a>
      </div>
    </section>
  </main>;
}
