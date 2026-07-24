import { CalendarDays, CheckCircle2, Construction, Sparkles } from 'lucide-react';
import { changelogEntries } from '@/lib/changelog';

export function ChangelogWorkspace() {
  return <div className="page changelog-page">
    <header className="page-head">
      <div>
        <p className="eyebrow">Product updates</p>
        <h1>What&apos;s new</h1>
        <p className="lede">Improvements, fixes and new capabilities in the version running on your own Tagvico instance.</p>
      </div>
    </header>
    <div className="changelog-list">
      {changelogEntries.map((entry) => <article className="workspace-card changelog-entry" key={entry.version}>
        <header>
          <div className={`changelog-version${entry.status === 'unreleased' ? ' is-next' : ''}`}>
            {entry.status === 'unreleased' ? <Construction aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            <span>{entry.version}</span>
          </div>
          <div>
            <h2>{entry.title}</h2>
            <p>{entry.summary}</p>
          </div>
          <time><CalendarDays aria-hidden="true" /> {entry.date}</time>
        </header>
        <div className="changelog-groups">
          {entry.groups.map((group) => <section key={group.title}>
            <h3><Sparkles aria-hidden="true" /> {group.title}</h3>
            <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>)}
        </div>
      </article>)}
    </div>
  </div>;
}
