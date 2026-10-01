import { dueGroup, type DueGroup } from './dates';
import type { InboxCase, InboxPriority } from './types';

const PRIORITY_RANK: Record<InboxPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export const DUE_GROUPS: ReadonlyArray<{ key: DueGroup; label: string }> = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'week', label: 'This week' },
  { key: 'later', label: 'Later' }
];

export function compareCases(a: InboxCase, b: InboxCase) {
  return (a.dueAt || '9999-12-31').localeCompare(b.dueAt || '9999-12-31')
    || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    || a.title.localeCompare(b.title);
}

export type CaseGroups = {
  due: Array<{ key: DueGroup; label: string; items: InboxCase[] }>;
  /** Cases Tagvico proposed and nobody accepted yet; they are not a duty until someone says so. */
  suggestions: InboxCase[];
};

/** Splits active cases into the due-date groups; suggested cases form their own group whatever their date. */
export function groupCases(active: InboxCase[], today: string): CaseGroups {
  const accepted = active.filter((item) => item.status !== 'suggested').sort(compareCases);
  return {
    due: DUE_GROUPS.map((group) => ({ ...group, items: accepted.filter((item) => dueGroup(item.dueAt, today) === group.key) })),
    suggestions: active.filter((item) => item.status === 'suggested').sort(compareCases)
  };
}
