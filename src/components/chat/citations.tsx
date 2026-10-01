import { createContext, useContext, type ComponentProps } from 'react';
import type { CompanionToolActivity } from '@root/contracts/companion';

const CITATION_PATTERN = /\[doc:(\d+)\]/gi;
const DOCUMENT_HREF = /^\/documents\/\d+$/;

export type CitedDocument = { id: number; number: number; title: string };

/**
 * Document ids the model cited as [doc:ID], numbered by first appearance so
 * the inline chips and the source list below the answer always agree.
 */
export function citedDocumentIds(text: string): number[] {
  const ids: number[] = [];
  for (const match of text.matchAll(CITATION_PATTERN)) {
    const id = Number(match[1]);
    if (Number.isSafeInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Rewrites [doc:ID] markers into numbered links that CitationLink renders as chips. */
export function linkCitations(text: string, ids: number[]): string {
  return text.replace(CITATION_PATTERN, (marker, raw: string) => {
    const index = ids.indexOf(Number(raw));
    return index === -1 ? marker : `[${index + 1}](/documents/${Number(raw)})`;
  });
}

/** Titles for cited ids come only from the safe metadata the research tools returned. */
export function citedDocuments(
  ids: number[],
  activities: CompanionToolActivity[]
): CitedDocument[] {
  const titles = new Map<number, string>();
  for (const activity of activities) {
    for (const document of activity.result?.documents || []) titles.set(document.id, document.title);
  }
  return ids.map((id, index) => ({
    id,
    number: index + 1,
    title: titles.get(id) || `Document #${id}`
  }));
}

/** Titles of the documents an answer cites, so an inline source pill can name its document. */
export const CitationTitles = createContext<ReadonlyMap<number, string>>(new Map());

/** Markdown link override: `[1](/documents/42)` becomes a small source pill with the document title, other links stay plain. */
export function CitationLink({ href, children, node, ...anchor }: ComponentProps<'a'> & { node?: unknown }) {
  void node;
  const titles = useContext(CitationTitles);
  const label = typeof children === 'string' ? children : '';
  if (href && DOCUMENT_HREF.test(href) && /^\d{1,3}$/.test(label)) {
    const title = titles.get(Number(href.split('/').pop())) || `Source ${label}`;
    return <a
      className="chat-cite"
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
    >{title}</a>;
  }
  return <a {...anchor} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

export const citationComponents = { a: CitationLink };

/** Compact list of the cited documents under an answer. */
export function SourceChips({ documents }: { documents: CitedDocument[] }) {
  if (!documents.length) return null;
  return <div className="chat-sources-block">
    <p className="chat-sources-label">Sources</p>
    <ul className="chat-sources" aria-label="Sources">
      {documents.map((document) => <li key={document.id}>
        <a href={`/documents/${document.id}`} target="_blank" rel="noreferrer" title={document.title}>
          <b>{document.number}</b>
          <span>{document.title}</span>
        </a>
      </li>)}
    </ul>
  </div>;
}
