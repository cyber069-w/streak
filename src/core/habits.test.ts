import { describe, expect, it } from 'vitest';
import { startOfDay } from './day';
import { evaluate } from './engine';
import { latestRules, newHabit, withRules } from './habits';
import { DEFAULT_RULES, type HabitVersion } from './types';

const tz = DEFAULT_RULES.tz;
const noon = (d: string) => startOfDay(d, tz) + 12 * 3_600_000;
const base: Omit<HabitVersion, 'from' | 'savedAt'> = { schedule: { kind: 'daily' }, rest: { weekdays: [], dates: [] }, sources: [{ kind: 'manual' }], koban: { default: 10 } };

describe('editing habits', () => {
  it('a habit created today is edited in place', () => {
    const h = newHabit('Read', 'book', 0, base, noon('2026-11-12'), tz);
    const e = withRules(h, { ...base, koban: { default: 20 } }, noon('2026-11-12') + 1000, tz);
    expect(e.versions).toHaveLength(1);
    expect(e.versions[0].from).toBe('2026-11-12');
    expect(latestRules(e).koban.default).toBe(20);
  });

  it('later edits start tomorrow, and a second edit the same day replaces the first', () => {
    const h = newHabit('Read', 'book', 0, base, noon('2026-11-01'), tz);
    const once = withRules(h, { ...base, rest: { weekdays: [], dates: ['2026-11-12'] } }, noon('2026-11-12'), tz);
    const twice = withRules(once, { ...base, koban: { default: 30 } }, noon('2026-11-12') + 5000, tz);
    expect(twice.versions.map((v) => v.from)).toEqual(['2026-11-01', '2026-11-13']);
    // making today a rest day after the fact doesn't work
    const r = evaluate({ habits: [once], marks: [], external: {}, typing: [], purchases: [] }, noon('2026-11-12'), DEFAULT_RULES);
    expect(r.habits[0].days['2026-11-12'].status).toBe('pending');
  });

  it('new habits get a readable unique id', () => {
    expect(newHabit('Cold shower!', 'water', 0, base, 1_800_000_000_000, tz).id).toMatch(/^cold-shower-[a-z0-9]+$/);
  });
});
