/**
 * Monkeytype results through the official API with your ApeKey (`Authorization: ApeKey …`).
 * The API allows browser calls (CORS `*`), but `GET /results` may be called only 30 times a day per account
 * with ApeKeys – shared with Study Desk's Mac job. So Streak fetches only results newer than the last one it has,
 * at most every 30 minutes on its own (plus a Refresh button), never more than 10 times a day per device, and
 * shares the results with your other devices through sync.
 */
import { addDays, dayOf, weekStart, type Day } from './day';
import type { Mark, TypingResult } from './types';

export const API = 'https://api.monkeytype.com';
export const DAILY_BUDGET = 10;
export const AUTO_EVERY_MS = 30 * 60_000;
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
  479: 'The daily ApeKey limit (30 calls) is used up – tomorrow it works again.',
};

interface ApiResult { timestamp: number; wpm: number; acc: number; testDuration?: number; mode?: string; mode2?: string }

/** Results on or after `since` (ms), newest API shape → Streak's compact one. */
export async function fetchResults(apeKey: string, since: number, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<TypingResult[]> {
  const url = `${API}/results?onOrAfterTimestamp=${Math.max(EARLIEST, Math.floor(since))}&limit=1000`;
  let res: Response;
  try {
    res = await fetchFn(url, { headers: { Authorization: `ApeKey ${apeKey.trim()}` }, cache: 'no-store' });
  } catch {
    throw new MonkeytypeError('Monkeytype isn’t reachable right now.', 0);
  }
  if (!res.ok) throw new MonkeytypeError(WHY[res.status] ?? `Monkeytype answered with error ${res.status}.`, res.status);
  const body = (await res.json()) as { data?: ApiResult[] };
  return (body.data ?? [])
    .filter((r) => typeof r.timestamp === 'number' && typeof r.wpm === 'number')
    .map((r) => ({ ts: r.timestamp, wpm: Math.round(r.wpm * 10) / 10, acc: Math.round(r.acc * 10) / 10, sec: Math.round(r.testDuration ?? 0), mode: `${r.mode ?? ''} ${r.mode2 ?? ''}`.trim() }));
}

/** Calls made on this device today. */
export interface Budget { day: Day; calls: number; lastAt: number }

export function mayFetch(b: Budget | undefined, now: number, tz: string, manual: boolean): { ok: boolean; left: number } {
  const today = dayOf(now, tz);
  const calls = b?.day === today ? b.calls : 0;
  const left = DAILY_BUDGET - calls;
  if (left <= 0) return { ok: false, left: 0 };
  if (!manual && b && now - b.lastAt < AUTO_EVERY_MS) return { ok: false, left };
  return { ok: true, left };
}

export const spend = (b: Budget | undefined, now: number, tz: string): Budget => {
  const today = dayOf(now, tz);
  return { day: today, calls: (b?.day === today ? b.calls : 0) + 1, lastAt: now };
};

/** Where to continue: just after the newest result we have (from any device), else 30 days back. */
export const sinceOf = (have: TypingResult[], now: number) => (have.length ? Math.max(...have.map((r) => r.ts)) + 1 : now - 30 * 86_400_000);

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
