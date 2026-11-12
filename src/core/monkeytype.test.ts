import { describe, expect, it } from 'vitest';
import { startOfDay } from './day';
import { evaluate } from './engine';
import { DAILY_BUDGET, afterLight, fetchLast, fetchResults, mayFetch, mergeResults, sinceOf, spend, typingStats } from './monkeytype';
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
    await expect(fetchResults('k', 0, answer(479))).rejects.toThrow(/limit is reached/);
  });

  it('stays within the daily budget of full loads', () => {
    const t = noon('2026-11-12');
    let b = spend(undefined, t, tz);
    expect(mayFetch(b, t + 60_000, tz)).toEqual({ ok: true, left: DAILY_BUDGET - 1 });
    for (let i = 1; i < DAILY_BUDGET; i++) b = spend(b, t + i, tz);
    expect(mayFetch(b, t + 3_600_000, tz)).toEqual({ ok: false, left: 0 });
    expect(mayFetch(b, startOfDay('2026-11-13', tz), tz).ok).toBe(true); // a new Zurich day
  });

  it('asks for the last result cheaply and copes with an account without tests', async () => {
    let url = '';
    const one = (async (u: RequestInfo | URL) => {
      url = String(u);
      return new Response(JSON.stringify({ data: { timestamp: 1_800_000_000_000, wpm: 50.04, acc: 97, testDuration: 15, mode: 'time', mode2: '15' } }), { status: 200 });
    }) as typeof fetch;
    expect(await fetchLast('k', one)).toEqual({ ts: 1_800_000_000_000, wpm: 50, acc: 97, sec: 15, mode: 'time 15' });
    expect(url).toBe('https://api.monkeytype.com/results/last');
    expect(await fetchLast('k', (async () => new Response('{}', { status: 404 })) as typeof fetch)).toBeNull();
    expect(await fetchLast('k', (async () => new Response('{"data":null}', { status: 200 })) as typeof fetch)).toBeNull();
    await expect(fetchLast('k', (async () => new Response('{}', { status: 471 })) as typeof fetch)).rejects.toThrow(/inactive/);
  });

  it('adds a new last result at once and loads the full list once it went quiet', () => {
    const now = noon('2026-11-12');
    const r = (ts: number) => ({ ts, wpm: 50, acc: 97, sec: 15, mode: '' });
    const have = [r(100)];
    // nothing new, nothing pending → no full load
    expect(afterLight(r(100), have, now)).toEqual({ add: null, backfillFrom: undefined, loadNow: false });
    // a new test → add it, remember to load everything after 100 later
    expect(afterLight(r(300), have, now)).toEqual({ add: r(300), backfillFrom: 101, loadNow: false });
    // another one while typing → still from 101 (tests in between may be missing)
    expect(afterLight(r(400), [...have, r(300)], now, 101)).toEqual({ add: r(400), backfillFrom: 101, loadNow: false });
    // quiet again → one full load from 101
    expect(afterLight(r(400), [...have, r(300), r(400)], now, 101)).toEqual({ add: null, backfillFrom: 101, loadNow: true });
    // first time ever: the full load reaches 30 days back
    expect(afterLight(r(now - 5), [], now).backfillFrom).toBe(now - 30 * 86_400_000);
    // an account without tests
    expect(afterLight(null, [], now)).toEqual({ add: null, backfillFrom: undefined, loadNow: false });
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
