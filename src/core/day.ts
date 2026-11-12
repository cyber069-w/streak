/**
 * Calendar days in one fixed time zone (Europe/Zurich by default), independent of the device's zone.
 *
 * A day is a 'YYYY-MM-DD' string. Timestamps become days through Intl; stepping from day to day is
 * done on the calendar date itself (in UTC arithmetic), so a DST change can't skip or repeat a day.
 */
export type Day = string;
/** ISO weekday, Monday = 1 … Sunday = 7. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const DEFAULT_TZ = 'Europe/Zurich';

const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(ms: number, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(tz, f);
  }
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(ms)) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

const fmt = (y: number, m: number, d: number) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** The day a timestamp falls on in `tz`. */
export function dayOf(ms: number, tz = DEFAULT_TZ): Day {
  const p = parts(ms, tz);
  return fmt(p.year, p.month, p.day);
}

const utc = (day: Day) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const fromUtc = (ms: number) => {
  const d = new Date(ms);
  return fmt(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

export const addDays = (day: Day, n: number): Day => fromUtc(utc(day) + n * 86_400_000);
/** Whole days from `a` to `b` (positive if b is later). */
export const diffDays = (a: Day, b: Day) => Math.round((utc(b) - utc(a)) / 86_400_000);
export const weekdayOf = (day: Day): Weekday => (((new Date(utc(day)).getUTCDay() + 6) % 7) + 1) as Weekday;
/** Monday of the day's week. */
export const weekStart = (day: Day): Day => addDays(day, 1 - weekdayOf(day));
export const monthOf = (day: Day) => day.slice(0, 7);

/** Days from `a` to `b`, both included (empty if b < a). */
export function daysBetween(a: Day, b: Day): Day[] {
  const n = diffDays(a, b);
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => addDays(a, i));
}

/** The timestamp of midnight at the start of `day` in `tz`. */
export function startOfDay(day: Day, tz = DEFAULT_TZ): number {
  const guess = utc(day);
  // offset of tz at a moment = wall clock there (read as UTC) minus the moment
  const offsetAt = (ms: number) => {
    const p = parts(ms, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - (ms - (ms % 1000));
  };
  let ms = guess - offsetAt(guess);
  ms = guess - offsetAt(ms);
  return ms;
}
