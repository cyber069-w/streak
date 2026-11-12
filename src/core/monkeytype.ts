/**
 * Monkeytype results through the official API with your ApeKey (`Authorization: ApeKey …`).
 * The API allows browser calls (CORS `*`). Two calls are used:
 * - `GET /results/last` (60 an hour): cheap, so Streak asks it every few minutes while the app is open and
 *   adds a new test right away;
 * - `GET /results` (only 30 a day per ApeKey, shared with Study Desk's Mac job): the full list, loaded once
 *   after new tests showed up (so none in between is missed) or by the Refresh button – never more than
 *   10 times a day per device.
 * Results sync to your other devices.
 */
import { addDays, dayOf, weekStart, type Day } from './day';
import type { Mark, TypingResult } from './types';

export const API = 'https://api.monkeytype.com';
export const DAILY_BUDGET = 10;
/** How often the cheap last-result check runs while the app is open. */
export const LIGHT_EVERY_MS = 5 * 60_000;
const EARLIEST = 1589428800000; // the API's lower bound for onOrAfterTimestamp

export class MonkeytypeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const WHY: Record<number, string> = {
  401: 'Monkeytype didn’t accept the ApeKey.',
  403: 'Monkeytype didn’t allow this request.',
  429: 'Monkeytype’s rate limit is reached – try again later.',
  470: 'This ApeKey is not valid – copy it again from monkeytype.com.',
  471: 'This ApeKey is inactive – switch it to active in Monkeytype’s account settings.',
  472: 'This doesn’t look like an ApeKey.',
  479: 'Monkeytype’s ApeKey limit is reached – it works again later (the full list: tomorrow).',
};

interface ApiResult { timestamp: number; wpm: number; acc: number; testDuration?: number; mode?: string; mode2?: string }

const toResult = (r: ApiResult): TypingResult => ({ ts: r.timestamp, wpm: Math.round(r.wpm * 10) / 10, acc: Math.round(r.acc * 10) / 10, sec: Math.round(r.testDuration ?? 0), mode: `${r.mode ?? ''} ${r.mode2 ?? ''}`.trim() });
const valid = (r: ApiResult | null | undefined): r is ApiResult => !!r && typeof r.timestamp === 'number' && typeof r.wpm === 'number';

async function call<T>(url: string, apeKey: string, fetchFn: typeof fetch, notFound?: T): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url, { headers: { Authorization: `ApeKey ${apeKey.trim()}` }, cache: 'no-store' });
  } catch {
    throw new MonkeytypeError('Monkeytype isn’t reachable right now.', 0);
  }
  if (res.status === 404 && notFound !== undefined) return notFound;
  if (!res.ok) throw new MonkeytypeError(WHY[res.status] ?? `Monkeytype answered with error ${res.status}.`, res.status);
  return ((await res.json()) as { data: T }).data;
}

/** Results on or after `since` (ms), newest API shape → Streak's compact one. Costs one of the 30 daily calls. */
export async function fetchResults(apeKey: string, since: number, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<TypingResult[]> {
  const url = `${API}/results?onOrAfterTimestamp=${Math.max(EARLIEST, Math.floor(since))}&limit=1000`;
  const data = await call<ApiResult[] | null>(url, apeKey, fetchFn);
  return (data ?? []).filter(valid).map(toResult);
}

/** The newest result only (null if there is none). Cheap: 60 calls an hour. */
export async function fetchLast(apeKey: string, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<TypingResult | null> {
  const data = await call<ApiResult | null>(`${API}/results/last`, apeKey, fetchFn, null);
  return valid(data) ? toResult(data) : null;
}

/** Calls made on this device today. */
export interface Budget { day: Day; calls: number; lastAt: number }

export function mayFetch(b: Budget | undefined, now: number, tz: string): { ok: boolean; left: number } {
  const calls = b?.day === dayOf(now, tz) ? b.calls : 0;
  const left = Math.max(0, DAILY_BUDGET - calls);
  return { ok: left > 0, left };
}

export const spend = (b: Budget | undefined, now: number, tz: string): Budget => {
  const today = dayOf(now, tz);
  return { day: today, calls: (b?.day === today ? b.calls : 0) + 1, lastAt: now };
};

/** Where to continue: just after the newest result we have (from any device), else 30 days back. */
export const sinceOf = (have: TypingResult[], now: number) => (have.length ? Math.max(...have.map((r) => r.ts)) + 1 : now - 30 * 86_400_000);

/**
 * What to do after the cheap check. A result newer than everything we have is added at once, and the full
 * list is loaded later from where we were before (`backfillFrom`), because more tests may have come in
 * between two checks. That full load happens on the first check that finds nothing new – one call per
 * typing session instead of one per check.
 */
export function afterLight(last: TypingResult | null, have: TypingResult[], now: number, backfillFrom?: number): { add: TypingResult | null; backfillFrom?: number; loadNow: boolean } {
  const isNew = !!last && (!have.length || last.ts > Math.max(...have.map((r) => r.ts)));
  if (isNew) return { add: last, backfillFrom: backfillFrom ?? sinceOf(have, now), loadNow: false };
  return { add: null, backfillFrom, loadNow: backfillFrom !== undefined };
}

/** Add new results; keeps one year. */
export function mergeResults(have: Record<string, TypingResult>, fresh: TypingResult[], now: number): Record<string, TypingResult> {
  const out: Record<string, TypingResult> = {};
  const cutoff = now - 366 * 86_400_000;
  for (const r of [...Object.values(have), ...fresh]) if (r.ts >= cutoff) out[String(r.ts)] = r;
  return out;
}

// ---------------------------------------------------------------------------
// Numbers for the Typing screen
// ---------------------------------------------------------------------------

export interface TypingPoint { ts: number; day: Day; wpm: number; acc: number; sec: number; mode: string; manual?: boolean }

export interface TypingStats {
  points: TypingPoint[];
  /** Average WPM / accuracy of the last 10 tests – "where you are now". */
  recentWpm: number | null;
  recentAcc: number | null;
  best7: number | null;
  bestEver: number | null;
  /** Best WPM per week (Monday), oldest first, last `weeks` weeks (null = no test that week). */
  weekly: Array<{ week: Day; best: number | null }>;
  /** Tests and minutes per day, last 14 days, oldest first. */
  daily: Array<{ day: Day; tests: number; minutes: number }>;
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function typingStats(results: TypingResult[], marks: Mark[], now: number, tz: string, weeks = 12): TypingStats {
  const today = dayOf(now, tz);
  const points: TypingPoint[] = [
    ...results.map((r) => ({ ...r, day: dayOf(r.ts, tz) })),
    ...marks.filter((m) => m.source === 'typing' && m.wpm).map((m) => ({ ts: m.createdAt, day: m.day, wpm: m.wpm!, acc: m.acc ?? 0, sec: 0, mode: 'entered by hand', manual: true })),
  ].sort((a, b) => a.ts - b.ts);
  const last10 = points.slice(-10);
  const week7 = points.filter((p) => p.day > addDays(today, -7));
  const thisWeek = weekStart(today);
  const weekly = Array.from({ length: weeks }, (_, i) => {
    const week = addDays(thisWeek, -7 * (weeks - 1 - i));
    const ws = points.filter((p) => weekStart(p.day) === week).map((p) => p.wpm);
    return { week, best: ws.length ? Math.max(...ws) : null };
  });
  const daily = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, i - 13);
    const ps = points.filter((p) => p.day === day && !p.manual);
    return { day, tests: ps.length, minutes: Math.round(ps.reduce((n, p) => n + p.sec, 0) / 6) / 10 };
  });
  return {
    points,
    recentWpm: avg(last10.map((p) => p.wpm)),
    recentAcc: avg(last10.map((p) => p.acc)),
    best7: week7.length ? Math.max(...week7.map((p) => p.wpm)) : null,
    bestEver: points.length ? Math.max(...points.map((p) => p.wpm)) : null,
    weekly,
    daily,
  };
}
