export default function Loading() {
  return <main className="route-state-page" aria-busy="true" aria-label="Loading Tagvico">
    <section className="route-state-card">
      <span className="route-state-mark" aria-hidden="true" />
      <p className="eyebrow">Tagvico</p>
      <h1>Loading your workspace…</h1>
      <p>The current page is being prepared without interrupting document processing.</p>
    </section>
  </main>;
}
