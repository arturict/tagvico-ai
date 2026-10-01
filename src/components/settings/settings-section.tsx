import type { ReactNode } from 'react';

/**
 * A group of settings: a small section title, an optional one-line note and
 * rows separated by hairlines. Direct children become rows (SettingsRow,
 * DraftField, DraftTextarea or any block), so no wrapper cards are needed.
 */
export function SettingsSection({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return <section className="set-section">
    <h2 className="set-section-title">{title}</h2>
    {description ? <p className="set-section-note">{description}</p> : null}
    <div className="set-rows">{children}</div>
  </section>;
}

/**
 * One setting: label on the left with at most one short secondary line, the
 * control on the right. `stack` puts the control under the label for wide
 * content such as text areas, lists and forms.
 */
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
  return <div className={`set-row${stack ? ' is-stacked' : ''}`}>
    <div className="set-row-copy">
      <h3 className="set-row-title">{title}</h3>
      {description ? <p className="set-row-description">{description}</p> : null}
    </div>
    <div className="set-row-control">{children}</div>
  </div>;
}
