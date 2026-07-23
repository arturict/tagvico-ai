import type { ReactNode } from 'react';

export function SettingsSection({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return <section className="settings-section">
    <header className="settings-section-head">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </header>
    <div className="settings-section-body">{children}</div>
  </section>;
}

export function SettingsRow({
  title,
  description,
  children,
  stack = false
}: {
  title: string;
  description?: string;
  children: ReactNode;
  stack?: boolean;
}) {
  return <div className={`settings-row${stack ? ' is-stacked' : ''}`}>
    <div className="settings-row-copy">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
    <div className="settings-row-control">{children}</div>
  </div>;
}
