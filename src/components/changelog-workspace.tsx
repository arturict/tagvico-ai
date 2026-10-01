import { changelogEntries } from '@/lib/changelog';
import { Mascot } from '@/components/mascot/mascot';

export function ChangelogWorkspace() {
  return <div className="page-column log-page">
    <header className="page-header">
      <div className="page-header-text log-head">
        <Mascot pose="waving" size={48} />
        <h1 className="page-title">What&apos;s new</h1>
      </div>
    </header>
    <div className="log-list">
      {changelogEntries.map((entry) => <article className="log-entry" key={entry.version}>
        <header className="log-entry-head">
          <h2 className="log-entry-title">{entry.title}</h2>
          <p className="meta">
            Version {entry.version} · {entry.status === 'unreleased' ? 'In progress' : entry.date}
          </p>
        </header>
        <p className="log-summary">{entry.summary}</p>
        {entry.groups.map((group) => <section className="log-group" key={group.title}>
          <h3 className="log-group-title">{group.title}</h3>
          <ul className="log-items">{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>)}
      </article>)}
    </div>
  </div>;
}
