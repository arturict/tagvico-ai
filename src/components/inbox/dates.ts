const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Households are Swiss: "today" and every due-date comparison use this time zone, never the server's. */
export const HOUSEHOLD_TIME_ZONE = 'Europe/Zurich';

const zurichDay = new Intl.DateTimeFormat('en-CA', { timeZone: HOUSEHOLD_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const zurichClock = new Intl.DateTimeFormat('en-GB', { timeZone: HOUSEHOLD_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function dayNumber(date: string) {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function addDays(date: string, days: number) {
  return new Date((dayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** Calendar date (YYYY-MM-DD) of an instant in Europe/Zurich. */
export function zurichToday(now: Date = new Date()) {
  return zurichDay.format(now);
}

/** SQLite stores CURRENT_TIMESTAMP as "YYYY-MM-DD HH:MM:SS" in UTC; this reads it back as an instant. */
export function parseSqliteTimestamp(value: string) {
  const text = String(value || '').trim();
  if (!text) return null;
  const parsed = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Zurich calendar date of a stored UTC timestamp, or null when it cannot be read. */
export function zurichDateOf(value: string) {
  const parsed = parseSqliteTimestamp(value);
  return parsed ? zurichToday(parsed) : null;
}

/** Deterministic short date such as "25 Sep"; avoids locale differences between server and browser. */
export function shortDate(date: string) {
  const [, month, day] = date.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

/** "1 Oct, 07:39" in Europe/Zurich for a stored UTC timestamp. */
export function shortDateTime(value: string) {
  const parsed = parseSqliteTimestamp(value);
  if (!parsed) return '';
  return `${shortDate(zurichToday(parsed))}, ${zurichClock.format(parsed)}`;
}

export type DueTone = 'overdue' | 'soon' | 'calm';
export type DueGroup = 'overdue' | 'week' | 'later';

/** Overdue before today, "This week" up to seven days ahead, everything else (including no date) later. */
export function dueGroup(dueAt: string | null, today: string): DueGroup {
  if (!dueAt) return 'later';
  const day = dueAt.slice(0, 10);
  if (day < today) return 'overdue';
  return day <= addDays(today, 7) ? 'week' : 'later';
}

/** Relative label plus the calendar date, such as "Due in 2 days · 3 Oct"; far dates read "Due 12 Oct". */
export function dueChip(dueAt: string, today: string): { label: string; tone: DueTone } {
  const diff = dayNumber(dueAt) - dayNumber(today);
  const date = shortDate(dueAt);
  if (diff < 0) return { label: `${-diff} day${diff === -1 ? '' : 's'} overdue · ${date}`, tone: 'overdue' };
  if (diff === 0) return { label: `Due today · ${date}`, tone: 'soon' };
  if (diff === 1) return { label: `Due tomorrow · ${date}`, tone: 'soon' };
  if (diff <= 6) return { label: `Due in ${diff} days · ${date}`, tone: diff <= 2 ? 'soon' : 'calm' };
  return { label: `Due ${date}`, tone: 'calm' };
}

const AMOUNT = /\b(CHF|EUR|USD|GBP)\s?(\d{1,3}(?:['’]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)|(?<![\d.,])(\d{1,3}(?:['’]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s?(CHF|EUR|USD|GBP)\b/i;

/**
 * Amount quoted in a case title or summary, such as "CHF 214.35". It is read from the
 * text Tagvico stored for the case; when the text names no amount nothing is shown.
 */
export function extractAmount(...texts: Array<string | null | undefined>) {
  for (const text of texts) {
    const match = AMOUNT.exec(String(text || ''));
    if (!match) continue;
    const currency = (match[1] || match[4]).toUpperCase();
    const value = (match[2] || match[3]).replace(/['’]/g, '').replace(',', '.');
    if (Number.isFinite(Number(value))) return `${currency} ${value}`;
  }
  return null;
}
