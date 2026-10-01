/**
 * The chat greeting follows the time of day. The server computes the part of the day once, from
 * one timestamp in the household's time zone, and passes it to the page as a prop, so the server
 * render and the hydrated client render always agree.
 */

export const GREETING_TIME_ZONE = 'Europe/Zurich';

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function dayPart(now: Date, timeZone = GREETING_TIME_ZONE): DayPart {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(now));
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

export function greeting(part: DayPart | undefined, name: string) {
  return part ? `Good ${part}, ${name}` : `What can I help with, ${name}?`;
}
