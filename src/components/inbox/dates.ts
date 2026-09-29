const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayNumber(date: string) {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function addDays(date: string, days: number) {
  return new Date((dayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** Deterministic short date such as "25 Sep"; avoids locale differences between server and browser. */
export function shortDate(date: string) {
  const [, month, day] = date.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

export type DueTone = 'overdue' | 'soon' | 'calm';

export function dueChip(dueAt: string, today: string): { label: string; tone: DueTone } {
  const diff = dayNumber(dueAt) - dayNumber(today);
  if (diff < 0) return { label: `${-diff} day${diff === -1 ? '' : 's'} overdue`, tone: 'overdue' };
  if (diff === 0) return { label: 'Due today', tone: 'soon' };
  if (diff === 1) return { label: 'Due tomorrow', tone: 'soon' };
  if (diff <= 6) return { label: `Due in ${diff} days`, tone: diff <= 2 ? 'soon' : 'calm' };
  return { label: `Due ${shortDate(dueAt)}`, tone: 'calm' };
}
