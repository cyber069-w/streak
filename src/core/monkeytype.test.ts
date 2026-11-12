import { describe, expect, it } from 'vitest';
import { startOfDay } from './day';
import { evaluate } from './engine';
import { DAILY_BUDGET, fetchResults, mayFetch, mergeResults, sinceOf, spend, typingStats } from './monkeytype';
import { DEFAULT_RULES, type Habit } from './types';

const tz = DEFAULT_RULES.tz;
const noon = (d: string) => startOfDay(d, tz) + 12 * 3_600_000;

describe('Monkeytype API', () => {
  it('sends the ApeKey, asks only for newer results and maps them', async () => {
    let seen: { url: string; auth: string } | null = null;
    const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
      seen = { url: String(url), auth: (init?.headers as Record<string, string>).Authorization };
      return new Response(JSON.stringify({ data: [{ _id: 'x', timestamp: 1_800_000_000_000, wpm: 47.33, acc: 96.04, testDuration: 30.2, mode: 'time', mode2: '30' }] }), { status: 200 });
    }) as typeof fetch;
    const r = await fetchResults(' key123 ', 1_799_000_000_000, fetchFn);
    expect(seen).toEqual({ url: 'https://api.monkeytype.com/results?onOrAfterTimestamp=1799000000000&limit=1000', auth: 'ApeKey key123' });
    expect(r).toEqual([{ ts: 1_800_000_000_000, wpm: 47.3, acc: 96, sec: 30, mode: 'time 30' }]);
  });

  it('explains inactive keys and the daily limit', async () => {
    const answer = (status: number) => (async () => new Response('{}', { status })) as typeof fetch;
    await expect(fetchResults('k', 0, answer(471))).rejects.toThrow(/inactive/);
    await expect(fetchResults('k', 0, answer(479))).rejects.toThrow(/30 calls/);
  });

  it('stays within the daily budget and waits 30 min between automatic checks', () => {
    const t = noon('2026-11-12');
    let b = spend(undefined, t, tz);
    expect(mayFetch(b, t + 10 * 60_000, tz, false).ok).toBe(false);
    expect(mayFetch(b, t + 10 * 60_000, tz, true).ok).toBe(true);
    expect(mayFetch(b, t + 31 * 60_000, tz, false)).toEqual({ ok: true, left: DAILY_BUDGET - 1 });
    for (let i = 1; i < DAILY_BUDGET; i++) b = spend(b, t + i, tz);
    expect(mayFetch(b, t + 3_600_000, tz, true)).toEqual({ ok: false, left: 0 });
    expect(mayFetch(b, startOfDay('2026-11-13', tz), tz, false).ok).toBe(true); // a new Zurich day
  });

  it('continues after the newest result it has (from any device)', () => {
    const now = noon('2026-11-12');
    expect(sinceOf([], now)).toBe(now - 30 * 86_400_000);
    expect(sinceOf([{ ts: 5, wpm: 1, acc: 1, sec: 1, mode: '' }, { ts: 9, wpm: 1, acc: 1, sec: 1, mode: '' }], now)).toBe(10);
    expect(Object.keys(mergeResults({ '9': { ts: 9, wpm: 1, acc: 1, sec: 1, mode: '' } }, [{ ts: now, wpm: 2, acc: 1, sec: 1, mode: '' }], now))).toEqual([String(now)]);
  });
});

describe('typing stats and the Typing habit', () => {
  const test = (day: string, wpm: number, sec = 30, h = 12) => ({ ts: startOfDay(day, tz) + h * 3_600_000, wpm, acc: 95, sec, mode: 'time 30' });

  it('weekly best, recent average and minutes per day', () => {
    const results = [test('2026-11-02', 41), test('2026-11-04', 44), test('2026-11-10', 46), test('2026-11-12', 48, 600)];
    const s = typingStats(results, [], noon('2026-11-12'), tz, 3);
    expect(s.weekly).toEqual([{ week: '2026-10-26', best: null }, { week: '2026-11-02', best: 44 }, { week: '2026-11-09', best: 48 }]);
    expect(s.recentWpm).toBe(44.8);
    expect(s.best7).toBe(48);
    expect(s.daily.at(-1)).toEqual({ day: '2026-11-12', tests: 1, minutes: 10 });
  });

  it('a manual WPM entry counts in the stats and completes Typing', () => {
    const typing: Habit = {
      id: 'typing', name: 'Typing', icon: '', order: 0, createdDay: '2026-11-12',
      versions: [{ from: '2026-11-12', savedAt: noon('2026-11-12'), schedule: { kind: 'daily' }, rest: { weekdays: [], dates: [] }, sources: [{ kind: 'monkeytype', minMinutes: 10, minTests: 5 }], koban: { default: 8 } }],
    };
    const mark = { id: 'typing:2026-11-12:typing', habitId: 'typing', day: '2026-11-12', createdAt: noon('2026-11-12'), source: 'typing' as const, wpm: 61, acc: 96 };
    const r = evaluate({ habits: [typing], marks: [mark], external: {}, typing: [], purchases: [] }, noon('2026-11-12'), DEFAULT_RULES);
    expect(r.habits[0].days['2026-11-12'].via?.via).toBe('typing');
    expect(r.badges.find((b) => b.id === 'wpm60')?.earned).toBe('2026-11-12');
    expect(typingStats([], [mark], noon('2026-11-12'), tz).bestEver).toBe(61);
  });
});
