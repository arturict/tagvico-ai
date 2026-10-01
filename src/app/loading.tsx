import { Mascot } from '@/components/mascot/mascot';

export default function Loading() {
  return <main className="state-page" aria-busy="true" aria-label="Loading Tagvico">
    <section className="state-card">
      <Mascot pose="thinking" size={64} />
      <p className="state-note shimmer">Getting things ready…</p>
    </section>
  </main>;
}
